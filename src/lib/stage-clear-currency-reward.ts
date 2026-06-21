/** 2回目以降クリア時の歩通貨: floor(stageNo / 5) + 2 */
export function repeatClearPawnReward(stageNo: number): number {
  if (!Number.isInteger(stageNo) || stageNo <= 0) return 0;
  return Math.floor(stageNo / 5) + 2;
}

/** ステージ初回クリア時の歩・金通貨（段階別）。 */
export function firstClearStageCurrencyGrant(stageNo: number): { pawn: number; gold: number } {
  if (!Number.isInteger(stageNo) || stageNo <= 0) {
    return { pawn: 0, gold: 0 };
  }
  if (stageNo <= 5) return { pawn: 5, gold: 0 };
  if (stageNo <= 10) return { pawn: 5, gold: 1 };
  if (stageNo <= 20) return { pawn: 8, gold: 2 };
  if (stageNo <= 30) return { pawn: 12, gold: 2 };
  if (stageNo <= 40) return { pawn: 20, gold: 3 };
  return { pawn: 25, gold: 3 };
}

export function computeStageClearCurrencyGrant(
  stageNo: number,
  firstClear: boolean,
): { pawn: number; gold: number } {
  if (firstClear) {
    return firstClearStageCurrencyGrant(stageNo);
  }
  return {
    pawn: repeatClearPawnReward(stageNo),
    gold: 0,
  };
}
