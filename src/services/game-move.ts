import { applyAiMove } from '@/lib/ai-engine-client';
import type {
  AiMove,
  AiMoveMeta,
  AiMoveRequest,
  AiPosition,
  CanonicalPosition,
  CommittedMoveResponse,
  GameStatusSnapshot,
} from '@/lib/ai-engine-contract';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { NormalizedEngineConfig } from '@/lib/engine-config';
import { attachSkillEffectsToAiRequest } from '@/services/ai-skill-effects';
import { PieceMappingService } from '@/services/piece-mapping';

type PersistedPositionRow = {
  game_id: string;
  board_state: Record<string, unknown>;
  hands: Record<string, unknown>;
  side_to_move: 'player' | 'enemy';
  turn_number: number;
  move_count: number;
  sfen: string | null;
  state_hash: string | null;
};

type PersistedGameRow = {
  game_id: string;
  status: GameStatusSnapshot['status'];
  result: GameStatusSnapshot['result'];
  winner_side: GameStatusSnapshot['winnerSide'];
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  return {};
}

function normalizeHandCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function decrementHandsToken(handsPart: string, targetToken: string): string {
  if (!handsPart || handsPart === '-') return '-';
  const chunks: Array<{ count: number; token: string }> = [];
  let i = 0;
  while (i < handsPart.length) {
    let num = '';
    while (i < handsPart.length && handsPart[i] >= '0' && handsPart[i] <= '9') {
      num += handsPart[i];
      i += 1;
    }
    if (i >= handsPart.length) break;
    const token = handsPart[i] ?? '';
    i += 1;
    const count = num.length > 0 ? Math.max(1, Number(num)) : 1;
    if (!token) continue;
    chunks.push({ count, token });
  }
  let consumed = false;
  for (const chunk of chunks) {
    if (!consumed && chunk.token === targetToken && chunk.count > 0) {
      chunk.count -= 1;
      consumed = true;
    }
  }
  const normalized = chunks
    .filter((chunk) => chunk.count > 0)
    .map((chunk) => `${chunk.count > 1 ? String(chunk.count) : ''}${chunk.token}`)
    .join('');
  return normalized.length > 0 ? normalized : '-';
}

function handCountByCodeCaseInsensitive(
  bag: Record<string, unknown>,
  pieceCodeUpper: string,
): number {
  for (const [key, raw] of Object.entries(bag)) {
    if (key.toUpperCase() !== pieceCodeUpper) continue;
    return normalizeHandCount(raw);
  }
  return 0;
}

function sfenTokenForSide(token: string, side: 'player' | 'enemy'): string {
  if (!token || token.length !== 1) return token;
  const symbolForEnemy: Readonly<Record<string, string>> = {
    $: '%',
    '!': '?',
    '&': '*',
    '(': ')',
    '#': '~',
    '@': '`',
    '^': '_',
    '[': ']',
    '<': '>',
    '{': '}',
    ':': ';',
    '.': ',',
    '"': "'",
  };
  const symbolForPlayer: Readonly<Record<string, string>> = Object.fromEntries(
    Object.entries(symbolForEnemy).map(([player, enemy]) => [enemy, player]),
  );
  if (side === 'player') {
    if (symbolForPlayer[token]) return symbolForPlayer[token];
    if (symbolForEnemy[token]) return token;
    return token.toUpperCase();
  }
  if (symbolForEnemy[token]) return symbolForEnemy[token];
  if (symbolForPlayer[token]) return token;
  return token.toLowerCase();
}

function enforceDroppedPieceConsumed(
  beforePosition: CanonicalPosition,
  position: CanonicalPosition,
  move: AiMove,
  actorSide: 'player' | 'enemy',
  mappingService: PieceMappingService,
): CanonicalPosition {
  if (!move.dropPieceCode) return position;
  const side: 'player' | 'enemy' = actorSide;
  const want = move.dropPieceCode.toUpperCase();
  const beforeHandsRoot = asRecord(beforePosition.hands);
  const beforeBag = asRecord(side === 'player' ? beforeHandsRoot.player : beforeHandsRoot.enemy);

  const handsRoot = asRecord(position.hands);
  const playerRaw = asRecord(handsRoot.player);
  const enemyRaw = asRecord(handsRoot.enemy);
  const player = { ...playerRaw };
  const enemy = { ...enemyRaw };
  const bag = side === 'player' ? player : enemy;
  const beforeCount = handCountByCodeCaseInsensitive(beforeBag, want);
  const afterCount = handCountByCodeCaseInsensitive(bag, want);
  // エンジン側で既に打ち駒消費済みなら二重減算しない
  if (beforeCount <= 0 || afterCount < beforeCount) {
    return position;
  }

  let matchedKey: string | null = null;
  for (const key of Object.keys(bag)) {
    if (key.toUpperCase() === want) {
      matchedKey = key;
      break;
    }
  }
  const targetKey = matchedKey ?? want;
  const current = normalizeHandCount(bag[targetKey]);
  const decrementedCount = Math.max(0, current - 1);
  if (decrementedCount <= 0) {
    delete bag[targetKey];
  } else {
    bag[targetKey] = decrementedCount;
  }

  const next = {
    ...position,
    hands: {
      ...handsRoot,
      player,
      enemy,
    },
  };

  const token = mappingService.displayCharToSfen(want);
  if (!next.sfen || !token || token.length !== 1) {
    return next;
  }
  const parts = next.sfen.trim().split(/\s+/);
  if (parts.length < 4) {
    return next;
  }
  const targetToken = sfenTokenForSide(token, side);
  parts[2] = decrementHandsToken(parts[2] ?? '-', targetToken);
  return { ...next, sfen: parts.join(' ') };
}

function reconcileStarReturnOwnership(
  position: CanonicalPosition,
  move: AiMove,
  actorSide: 'player' | 'enemy',
  mappingService: PieceMappingService,
): CanonicalPosition {
  const captured = move.capturedPieceCode?.toUpperCase();
  if (captured !== 'HOS' && captured !== '星') {
    return position;
  }
  const handsRoot = asRecord(position.hands);
  const playerRaw = asRecord(handsRoot.player);
  const enemyRaw = asRecord(handsRoot.enemy);
  const player = { ...playerRaw };
  const enemy = { ...enemyRaw };

  const actorBag = actorSide === 'player' ? player : enemy;
  const ownerBag = actorSide === 'player' ? enemy : player;
  const actorHosCount = normalizeHandCount(actorBag.HOS);
  const ownerHosCount = normalizeHandCount(ownerBag.HOS);
  // 星スキル発動時に発生する「双方の手駒に HOS が同時に載る」異常だけを補正する。
  if (actorHosCount <= 0 || ownerHosCount <= 0) {
    return position;
  }

  const nextActorCount = Math.max(0, actorHosCount - 1);
  if (nextActorCount <= 0) {
    delete actorBag.HOS;
  } else {
    actorBag.HOS = nextActorCount;
  }

  const next = {
    ...position,
    hands: {
      ...handsRoot,
      player,
      enemy,
    },
  };

  const token = mappingService.displayCharToSfen('HOS');
  if (!next.sfen || !token || token.length !== 1) {
    return next;
  }
  const parts = next.sfen.trim().split(/\s+/);
  if (parts.length < 4) {
    return next;
  }
  const targetToken = sfenTokenForSide(token, actorSide);
  parts[2] = decrementHandsToken(parts[2] ?? '-', targetToken);
  return { ...next, sfen: parts.join(' ') };
}

function reconcileCapturedPieceOwnership(
  position: CanonicalPosition,
  move: AiMove,
  actorSide: 'player' | 'enemy',
  mappingService: PieceMappingService,
): CanonicalPosition {
  const captured = move.capturedPieceCode?.toUpperCase();
  if (!captured) return position;
  const handsRoot = asRecord(position.hands);
  const playerRaw = asRecord(handsRoot.player);
  const enemyRaw = asRecord(handsRoot.enemy);
  const player = { ...playerRaw };
  const enemy = { ...enemyRaw };

  const actorBag = actorSide === 'player' ? player : enemy;
  const ownerBag = actorSide === 'player' ? enemy : player;
  const actorCount = normalizeHandCount(actorBag[captured]);
  const ownerCount = normalizeHandCount(ownerBag[captured]);
  // 取り直後に「双方が同時に同駒を所持」の異常だけ補正する。
  if (actorCount <= 0 || ownerCount <= 0) {
    return position;
  }

  const nextOwnerCount = Math.max(0, ownerCount - 1);
  if (nextOwnerCount <= 0) {
    delete ownerBag[captured];
  } else {
    ownerBag[captured] = nextOwnerCount;
  }

  const next = {
    ...position,
    hands: {
      ...handsRoot,
      player,
      enemy,
    },
  };

  const token = mappingService.displayCharToSfen(captured);
  if (!next.sfen || !token || token.length !== 1) {
    return next;
  }
  const parts = next.sfen.trim().split(/\s+/);
  if (parts.length < 4) {
    return next;
  }
  const ownerSide: 'player' | 'enemy' = actorSide === 'player' ? 'enemy' : 'player';
  const ownerToken = sfenTokenForSide(token, ownerSide);
  parts[2] = decrementHandsToken(parts[2] ?? '-', ownerToken);
  return { ...next, sfen: parts.join(' ') };
}

function stampLastMovedPieceState(
  position: CanonicalPosition,
  move: AiMove,
  actorSide: 'player' | 'enemy',
  sourcePosition?: { boardState?: Record<string, unknown> | null } | null,
): CanonicalPosition {
  if (move.fromRow == null || move.fromCol == null) return position;
  const boardStateRoot = asRecord(position.boardState);
  if (!boardStateRoot) return position;
  const skillStateRaw = asRecord(boardStateRoot.skill_state ?? boardStateRoot.skillState) ?? {};
  const key = actorSide === 'player' ? 'last_player_moved_piece' : 'last_enemy_moved_piece';
  const pieceRows = Array.isArray(boardStateRoot.pieces) ? boardStateRoot.pieces : [];
  const sourceBoardState = asRecord(sourcePosition?.boardState ?? null);
  const sourcePieceRows = Array.isArray(sourceBoardState?.pieces) ? sourceBoardState.pieces : [];
  const movedPiece = pieceRows
    .map((raw) => asRecord(raw))
    .find((entry) => {
      if (!entry) return false;
      const row = typeof entry.row === 'number' ? entry.row : null;
      const col = typeof entry.col === 'number' ? entry.col : null;
      const side = entry.side === 'enemy' ? 'enemy' : 'player';
      return row === move.toRow && col === move.toCol && side === actorSide;
    });
  const sourcePiece = sourcePieceRows
    .map((raw) => asRecord(raw))
    .find((entry) => {
      if (!entry) return false;
      const row = typeof entry.row === 'number' ? entry.row : null;
      const col = typeof entry.col === 'number' ? entry.col : null;
      const side = entry.side === 'enemy' ? 'enemy' : 'player';
      return row === move.fromRow && col === move.fromCol && side === actorSide;
    });
  const sourceChar =
    typeof sourcePiece?.char === 'string' && !/^piece_[a-z0-9]+$/i.test(sourcePiece.char.trim())
      ? sourcePiece.char
      : null;
  const sourceCode = typeof sourcePiece?.pieceCode === 'string' ? sourcePiece.pieceCode : null;
  const customMoveVectors = asRecord(sourceBoardState?.custom_move_vectors ?? null);
  const rawCopiedVectors =
    (typeof sourceCode === 'string' && Array.isArray(customMoveVectors?.[sourceCode.toUpperCase()])
      ? (customMoveVectors?.[sourceCode.toUpperCase()] as unknown[])
      : null) ??
    (typeof move.pieceCode === 'string' &&
    Array.isArray(customMoveVectors?.[move.pieceCode.toUpperCase()])
      ? (customMoveVectors?.[move.pieceCode.toUpperCase()] as unknown[])
      : null);
  const copiedMoveVectors = Array.isArray(rawCopiedVectors)
    ? rawCopiedVectors
        .map((v) => asRecord(v))
        .filter((v): v is Record<string, unknown> => Boolean(v))
        .map((v) => {
          const dc = Number(v.dc);
          const dr = Number(v.dr);
          const slide = v.slide === true;
          const captureMode = typeof v.capture_mode === 'string' ? v.capture_mode : undefined;
          if (!Number.isFinite(dc) || !Number.isFinite(dr)) return null;
          return {
            dx: dc,
            dy: dr,
            maxStep: slide ? 9 : 1,
            ...(captureMode ? { captureMode } : {}),
          };
        })
        .filter(
          (v): v is { dx: number; dy: number; maxStep: number; captureMode?: string } => v != null,
        )
    : [];
  const payload = {
    side: actorSide,
    row: move.toRow,
    col: move.toCol,
    // opaque id で上書きされると「書」のコピー元解決が壊れるため、着手情報の canonical code を優先する。
    pieceCode:
      sourceCode ??
      move.pieceCode ??
      (typeof movedPiece?.pieceCode === 'string' ? movedPiece.pieceCode : null),
    char:
      sourceChar ??
      (typeof movedPiece?.char === 'string' && !/^piece_[a-z0-9]+$/i.test(movedPiece.char.trim())
        ? movedPiece.char
        : null),
    promoted:
      (typeof movedPiece?.promoted === 'boolean' && movedPiece.promoted) || move.promote === true,
    ...(copiedMoveVectors.length > 0 ? { copiedMoveVectors } : {}),
  };
  return {
    ...position,
    boardState: {
      ...boardStateRoot,
      skill_state: {
        ...skillStateRaw,
        [key]: payload,
      },
    },
  };
}

type LoadedGameState = {
  gameId: string;
  position: CanonicalPosition;
  game: GameStatusSnapshot;
};

type CommitGameMoveInput = {
  gameId: string;
  moveNo: number;
  actorSide: 'player' | 'enemy';
  clientMoveId?: string | null;
  move: AiMove;
  stateHash?: string | null;
  thoughtMs?: number | null;
  currentPosition?: AiPosition;
  aiInference?: {
    normalizedConfig: NormalizedEngineConfig;
    requestPayload: AiMoveRequest;
    responsePayload: { isCheckmate: false; selectedMove: AiMove; meta: AiMoveMeta };
  };
};

type CommitGameMoveDeps = {
  loadGameState: (gameId: string) => Promise<LoadedGameState>;
  enrichPosition: (
    gameId: string,
    position: CanonicalPosition,
    moveNo: number,
    mappingService: PieceMappingService,
  ) => Promise<AiPosition>;
  applyMove: (input: { position: AiPosition; selectedMove: AiMove }) => Promise<CanonicalPosition>;
  persistMove: (input: {
    gameId: string;
    moveNo: number;
    actorSide: 'player' | 'enemy';
    move: AiMove;
    thoughtMs?: number | null;
    position: CanonicalPosition;
    game: GameStatusSnapshot;
  }) => Promise<void>;
  insertInferenceLog: (input: {
    gameId: string;
    moveNo: number;
    normalizedConfig: NormalizedEngineConfig;
    requestPayload: AiMoveRequest;
    responsePayload: { isCheckmate: false; selectedMove: AiMove; meta: AiMoveMeta };
  }) => Promise<void>;
  mappingService?: PieceMappingService;
};

function isTransientUpstreamError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  return (
    normalized.includes('502 bad gateway') ||
    normalized.includes('503 service unavailable') ||
    normalized.includes('504 gateway timeout') ||
    normalized.includes('fetch failed') ||
    normalized.includes('econnreset') ||
    normalized.includes('etimedout') ||
    normalized.includes('socket hang up')
  );
}

async function retryOnTransientError<T>(
  task: () => Promise<T>,
  retries = 2,
  delayMs = 120,
): Promise<T> {
  let attempt = 0;
  // 例: retries=2 -> 最大3回試行
  for (;;) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= retries || !isTransientUpstreamError(error)) {
        throw error;
      }
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}

export class CommitGameMoveError extends Error {
  readonly code:
    | 'GAME_NOT_FOUND'
    | 'GAME_ALREADY_FINISHED'
    | 'TURN_MISMATCH'
    | 'MOVE_NO_MISMATCH'
    | 'STALE_POSITION'
    | 'INVALID_POSITION';

  constructor(
    code:
      | 'GAME_NOT_FOUND'
      | 'GAME_ALREADY_FINISHED'
      | 'TURN_MISMATCH'
      | 'MOVE_NO_MISMATCH'
      | 'STALE_POSITION'
      | 'INVALID_POSITION',
    message: string,
  ) {
    super(message);
    this.name = 'CommitGameMoveError';
    this.code = code;
  }
}

export function createCommitGameMove(
  deps: CommitGameMoveDeps = {
    loadGameState,
    enrichPosition,
    applyMove: applyCanonicalMove,
    persistMove,
    insertInferenceLog,
  },
) {
  return async function commitGameMove(input: CommitGameMoveInput): Promise<CommittedMoveResponse> {
    const totalStart = Date.now();
    const metrics: Record<string, number> = {};

    const loadStart = Date.now();
    const gameState = await retryOnTransientError(() => deps.loadGameState(input.gameId));
    metrics.loadGameStateMs = Date.now() - loadStart;
    if (gameState.game.status !== 'in_progress') {
      throw new CommitGameMoveError('GAME_ALREADY_FINISHED', 'game is already finished');
    }

    const expectedMoveNo = gameState.position.moveCount + 1;
    if (input.moveNo !== expectedMoveNo) {
      throw new CommitGameMoveError(
        'MOVE_NO_MISMATCH',
        `expected moveNo ${expectedMoveNo} but got ${input.moveNo}`,
      );
    }
    if (input.actorSide !== gameState.position.sideToMove) {
      throw new CommitGameMoveError(
        'TURN_MISMATCH',
        `expected actorSide ${gameState.position.sideToMove} but got ${input.actorSide}`,
      );
    }
    if (
      input.stateHash &&
      gameState.position.stateHash &&
      input.stateHash !== gameState.position.stateHash
    ) {
      throw new CommitGameMoveError('STALE_POSITION', 'stateHash does not match current position');
    }

    const mappingService = deps.mappingService ?? (await PieceMappingService.fromDb());
    const enrichStart = Date.now();
    const currentPosition =
      input.currentPosition ??
      (await retryOnTransientError(() =>
        deps.enrichPosition(input.gameId, gameState.position, expectedMoveNo, mappingService),
      ));
    metrics.enrichPositionMs = Date.now() - enrichStart;
    const normalizedMove = withCapturedPieceCode(currentPosition, input.move, mappingService);

    const moveForEngine = normalizeMovePieceCodesForEngine(normalizedMove);
    const applyStart = Date.now();
    const appliedPosition = await retryOnTransientError(() =>
      deps.applyMove({
        position: currentPosition,
        selectedMove: moveForEngine,
      }),
    );
    const nextPosition = forceConsumeTurnIfShieldAborted({
      before: currentPosition,
      after: appliedPosition,
      move: normalizedMove,
      actorSide: input.actorSide,
    });
    metrics.applyMoveMs = Date.now() - applyStart;
    const dropConsumedPosition = enforceDroppedPieceConsumed(
      gameState.position,
      nextPosition,
      normalizedMove,
      input.actorSide,
      mappingService,
    );
    const capturedOwnershipFixed = reconcileCapturedPieceOwnership(
      dropConsumedPosition,
      normalizedMove,
      input.actorSide,
      mappingService,
    );
    const persistedPosition = reconcileStarReturnOwnership(
      capturedOwnershipFixed,
      normalizedMove,
      input.actorSide,
      mappingService,
    );
    const withLastMoved = stampLastMovedPieceState(
      persistedPosition,
      moveForEngine,
      input.actorSide,
      currentPosition as unknown as { boardState?: Record<string, unknown> | null },
    );
    const nextGame = deriveGameStatus(withLastMoved, mappingService);

    const persistStart = Date.now();
    await retryOnTransientError(() =>
      deps.persistMove({
        gameId: input.gameId,
        moveNo: expectedMoveNo,
        actorSide: input.actorSide,
        move: moveForEngine,
        thoughtMs: input.thoughtMs ?? null,
        position: withLastMoved,
        game: nextGame,
      }),
    );
    metrics.persistMoveMs = Date.now() - persistStart;

    const aiInference = input.aiInference;
    if (aiInference) {
      const inferenceLogStart = Date.now();
      await retryOnTransientError(() =>
        deps.insertInferenceLog({
          gameId: input.gameId,
          moveNo: expectedMoveNo,
          normalizedConfig: aiInference.normalizedConfig,
          requestPayload: aiInference.requestPayload,
          responsePayload: aiInference.responsePayload,
        }),
      );
      metrics.insertInferenceLogMs = Date.now() - inferenceLogStart;
    }

    const serverAppliedAt = new Date().toISOString();
    metrics.totalMs = Date.now() - totalStart;
    console.info(
      JSON.stringify({
        event: 'commit_game_move_timing',
        gameId: input.gameId,
        moveNo: expectedMoveNo,
        actorSide: input.actorSide,
        clientMoveId: input.clientMoveId ?? null,
        promote: Boolean(input.move.promote),
        ...metrics,
      }),
    );

    return {
      moveNo: expectedMoveNo,
      actorSide: input.actorSide,
      clientMoveId: input.clientMoveId ?? null,
      move: moveForEngine,
      skillTriggered: isSkillTriggeredMove(moveForEngine),
      serverAppliedAt,
      position: withLastMoved,
      game: nextGame,
    };
  };
}

function normalizeMovePieceCode(raw: string | null | undefined): string | null | undefined {
  if (raw == null) return raw;
  const upper = raw.trim().toUpperCase();
  if (!upper) return upper;
  const withoutPrefix = upper.startsWith('PIECE_SHOGI_')
    ? upper.slice('PIECE_SHOGI_'.length)
    : upper.startsWith('PIECE_')
      ? upper.slice('PIECE_'.length)
      : upper;
  // ai.shogi 側の explicit override は FIRE コードを参照するため、ENN を同義として寄せる。
  if (withoutPrefix === 'ENN') return 'FIRE';
  return withoutPrefix;
}

function normalizeMovePieceCodesForEngine(move: AiMove): AiMove {
  return {
    ...move,
    pieceCode: normalizeMovePieceCode(move.pieceCode) ?? move.pieceCode,
    dropPieceCode: normalizeMovePieceCode(move.dropPieceCode) ?? move.dropPieceCode,
    capturedPieceCode: normalizeMovePieceCode(move.capturedPieceCode) ?? move.capturedPieceCode,
  };
}

export const commitGameMove = createCommitGameMove();

export async function loadGameState(gameId: string): Promise<LoadedGameState> {
  const { data: positionRow, error: positionError } = await supabaseAdmin
    .schema('game')
    .from('positions')
    .select('game_id,board_state,hands,side_to_move,turn_number,move_count,sfen,state_hash')
    .eq('game_id', gameId)
    .maybeSingle<PersistedPositionRow>();
  if (positionError) throw positionError;

  const { data: gameRow, error: gameError } = await supabaseAdmin
    .schema('game')
    .from('games')
    .select('game_id,status,result,winner_side')
    .eq('game_id', gameId)
    .maybeSingle<PersistedGameRow>();
  if (gameError) throw gameError;

  if (!positionRow || !gameRow) {
    throw new CommitGameMoveError('GAME_NOT_FOUND', `game not found: ${gameId}`);
  }

  return {
    gameId,
    position: {
      sideToMove: positionRow.side_to_move,
      turnNumber: positionRow.turn_number,
      moveCount: positionRow.move_count,
      sfen: positionRow.sfen,
      stateHash: positionRow.state_hash,
      boardState: positionRow.board_state ?? {},
      hands: positionRow.hands ?? {},
    },
    game: {
      status: gameRow.status,
      result: gameRow.result,
      winnerSide: gameRow.winner_side,
    },
  };
}

export async function enrichPosition(
  gameId: string,
  position: CanonicalPosition,
  moveNo: number,
  mappingService: PieceMappingService,
): Promise<AiPosition> {
  const enriched = await attachSkillEffectsToAiRequest(
    {
      gameId,
      moveNo,
      position: {
        ...position,
        legalMoves: [],
      },
    },
    mappingService,
  );
  return enriched.position;
}

async function applyCanonicalMove(input: {
  position: AiPosition;
  selectedMove: AiMove;
}): Promise<CanonicalPosition> {
  const response = await applyAiMove(input);
  return response.position;
}

function toggleSide(side: CanonicalPosition['sideToMove']): CanonicalPosition['sideToMove'] {
  return side === 'player' ? 'enemy' : 'player';
}

function forceConsumeTurnIfShieldAborted(input: {
  before: CanonicalPosition;
  after: CanonicalPosition;
  move: AiMove;
  actorSide: 'player' | 'enemy';
}): CanonicalPosition {
  // 盾などで「取り」が無効化されたとき、エンジンが手番/手数を進めないことがある。
  // 仕様: 攻撃側の手番は終了し、相手番に移る。
  const attemptedCapture = (() => {
    if (input.move.dropPieceCode) return false;
    if (input.move.capturedPieceCode) return true;
    // capturedPieceCode が欠けていても、before の盤上に相手駒がいるマスへ入る手は捕獲試行として扱う。
    const boardState = (input.before.boardState ?? {}) as Record<string, unknown>;
    const rawPieces = Array.isArray((boardState as any).pieces)
      ? ((boardState as any).pieces as unknown[])
      : Array.isArray((boardState as any).placements)
        ? ((boardState as any).placements as unknown[])
        : [];
    for (const raw of rawPieces) {
      if (!raw || typeof raw !== 'object') continue;
      const obj = raw as any;
      const r = typeof obj.row === 'number' ? obj.row : null;
      const c = typeof obj.col === 'number' ? obj.col : null;
      if (r !== input.move.toRow || c !== input.move.toCol) continue;
      const side = obj.side === 'enemy' ? 'enemy' : 'player';
      return side !== input.actorSide;
    }
    return false;
  })();
  const noTurnAdvance =
    input.after.sideToMove === input.before.sideToMove &&
    input.after.moveCount === input.before.moveCount;
  if (!attemptedCapture || !noTurnAdvance) return input.after;

  const nextMoveCount = input.before.moveCount + 1;
  const nextSide = toggleSide(input.actorSide);

  const nextSfen = (() => {
    const sfen = input.after.sfen ?? input.before.sfen ?? null;
    if (!sfen) return sfen;
    const parts = sfen.trim().split(/\s+/);
    if (parts.length < 4) return sfen;
    parts[1] = nextSide === 'player' ? 'b' : 'w';
    parts[3] = String(Math.max(1, nextMoveCount + 1));
    return parts.join(' ');
  })();

  return {
    ...input.after,
    sideToMove: nextSide,
    moveCount: nextMoveCount,
    turnNumber: nextMoveCount + 1,
    sfen: nextSfen,
    // stateHash はエンジン由来のため不整合を避ける
    stateHash: null,
  };
}

async function persistMove(input: {
  gameId: string;
  moveNo: number;
  actorSide: 'player' | 'enemy';
  move: AiMove;
  thoughtMs?: number | null;
  position: CanonicalPosition;
  game: GameStatusSnapshot;
}) {
  const { error: moveError } = await supabaseAdmin
    .schema('game')
    .from('moves')
    .upsert(
      {
        game_id: input.gameId,
        move_no: input.moveNo,
        actor_side: input.actorSide,
        from_row: input.move.fromRow,
        from_col: input.move.fromCol,
        to_row: input.move.toRow,
        to_col: input.move.toCol,
        piece_code: input.move.pieceCode,
        promote: input.move.promote,
        drop_piece_code: input.move.dropPieceCode,
        captured_piece_code: input.move.capturedPieceCode,
        notation: input.move.notation,
        thought_ms: input.thoughtMs ?? null,
      },
      { onConflict: 'game_id,move_no' },
    );
  if (moveError) throw moveError;

  const { error: positionError } = await supabaseAdmin
    .schema('game')
    .from('positions')
    .upsert(
      {
        game_id: input.gameId,
        board_state: input.position.boardState,
        hands: input.position.hands,
        side_to_move: input.position.sideToMove,
        turn_number: input.position.turnNumber,
        move_count: input.position.moveCount,
        sfen: input.position.sfen ?? null,
        state_hash: input.position.stateHash ?? null,
      },
      { onConflict: 'game_id' },
    );
  if (positionError) throw positionError;

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    status: input.game.status,
    result: input.game.result,
    winner_side: input.game.winnerSide,
    ended_at: input.game.status === 'finished' ? new Date().toISOString() : null,
  };
  const { error: gameError } = await supabaseAdmin
    .schema('game')
    .from('games')
    .update(updatePayload)
    .eq('game_id', input.gameId);
  if (gameError) throw gameError;
}

export async function markGameFinished(
  gameId: string,
  result: GameStatusSnapshot['result'],
  winnerSide: GameStatusSnapshot['winnerSide'],
): Promise<void> {
  const { error } = await supabaseAdmin
    .schema('game')
    .from('games')
    .update({
      updated_at: new Date().toISOString(),
      status: 'finished',
      result,
      winner_side: winnerSide,
      ended_at: new Date().toISOString(),
    })
    .eq('game_id', gameId);
  if (error) throw error;
}

async function insertInferenceLog(input: {
  gameId: string;
  moveNo: number;
  normalizedConfig: NormalizedEngineConfig;
  requestPayload: AiMoveRequest;
  responsePayload: { isCheckmate: false; selectedMove: AiMove; meta: AiMoveMeta };
}) {
  const selectedMoveText =
    input.responsePayload.selectedMove.notation ??
    formatMoveText(input.responsePayload.selectedMove);

  const { error } = await supabaseAdmin.schema('game').from('ai_inference_logs').insert({
    game_id: input.gameId,
    move_no: input.moveNo,
    engine_version: input.responsePayload.meta.engineVersion,
    engine_config: input.normalizedConfig,
    request_payload: input.requestPayload,
    response_payload: input.responsePayload,
    selected_move: selectedMoveText,
    eval_cp: input.responsePayload.meta.evalCp,
    searched_nodes: input.responsePayload.meta.searchedNodes,
    search_depth: input.responsePayload.meta.searchDepth,
    think_ms: input.responsePayload.meta.thinkMs,
  });
  if (error) throw error;
}

function withCapturedPieceCode(
  position: CanonicalPosition,
  move: AiMove,
  mappingService: PieceMappingService,
): AiMove {
  if (move.notation === 'time_skill_only' || move.notation === 'house_skill_only') {
    return { ...move, capturedPieceCode: null };
  }
  if (move.capturedPieceCode || move.dropPieceCode) {
    return move;
  }
  const capturedPieceCode = pieceCodeAt(position, move.toRow, move.toCol, mappingService);
  return {
    ...move,
    capturedPieceCode,
  };
}

function pieceCodeAt(
  position: CanonicalPosition,
  row: number,
  col: number,
  mappingService: PieceMappingService,
): string | null {
  const boardState = (position.boardState ?? {}) as Record<string, unknown>;
  const rawPieces = Array.isArray((boardState as any).pieces)
    ? ((boardState as any).pieces as unknown[])
    : Array.isArray((boardState as any).placements)
      ? ((boardState as any).placements as unknown[])
      : [];
  for (const raw of rawPieces) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as any;
    const r = typeof obj.row === 'number' ? obj.row : null;
    const c = typeof obj.col === 'number' ? obj.col : null;
    if (r !== row || c !== col) continue;
    const ch =
      typeof obj.char === 'string'
        ? obj.char
        : typeof obj.piece?.char === 'string'
          ? obj.piece.char
          : '';
    const norm = (() => {
      try {
        return (ch ?? '').normalize('NFKC');
      } catch {
        return ch ?? '';
      }
    })();
    // 盤上の表示漢字が分かる場合はそれを優先して capturedPieceCode を確定させる。
    if (norm === '剣') return 'HOLY_SWORD';
    if (norm === '刀') return 'SWORD';
    if (norm === '盾') return 'SHIELD';
    const pc =
      typeof obj.pieceCode === 'string'
        ? obj.pieceCode
        : typeof obj.piece?.code === 'string'
          ? obj.piece.code
          : null;
    if (pc) return pc.toUpperCase();
    break;
  }

  return mappingService.displayCharAtSquare(position.sfen ?? null, row, col);
}

function deriveGameStatus(
  position: CanonicalPosition,
  mappingService: PieceMappingService,
): GameStatusSnapshot {
  const hasPlayerKing = mappingService.hasRawSfenToken(position.sfen ?? null, 'K');
  const hasEnemyKing = mappingService.hasRawSfenToken(position.sfen ?? null, 'k');

  if (!hasEnemyKing) {
    return {
      status: 'finished',
      result: 'player_win',
      winnerSide: 'player',
    };
  }
  if (!hasPlayerKing) {
    return {
      status: 'finished',
      result: 'enemy_win',
      winnerSide: 'enemy',
    };
  }
  return {
    status: 'in_progress',
    result: null,
    winnerSide: null,
  };
}

function formatMoveText(move: AiMove): string {
  const src =
    move.fromRow === null || move.fromCol === null ? 'drop' : `${move.fromRow},${move.fromCol}`;
  return `${src}->${move.toRow},${move.toCol}:${move.pieceCode}`;
}

function isSkillTriggeredMove(move: AiMove): boolean {
  if (move.dropPieceCode) return false;
  const notation = move.notation;
  if (!notation) return false;
  if (notation === 'time_normal') return false;
  if (notation === 'time_skill_only') return true;
  if (notation === 'house_skill_only') return true;
  if (/^[1-9][a-i][1-9][a-i]\+?$/i.test(notation)) return false;
  return true;
}
