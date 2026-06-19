import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('security hardening migrations', () => {
  it('revokes public execution from privileged RPCs', () => {
    const sql = read('supabase/migrations/20260619170000_harden_rating_and_stage_finish_rpcs.sql');

    expect(sql).toContain(
      'revoke execute on function public.apply_pvp_rating_for_match(text, uuid, uuid, uuid) from public, anon, authenticated;',
    );
    expect(sql).toContain(
      'revoke execute on function public.apply_pvp_rating_for_user(uuid, text, boolean, int) from public, anon, authenticated;',
    );
    expect(sql).toContain(
      'revoke execute on function public.finish_stage_battle_game_session(uuid, uuid, text, text, jsonb) from public, anon, authenticated;',
    );
  });

  it('requires recorded online match results before rating updates', () => {
    const sql = read('supabase/migrations/20260619170000_harden_rating_and_stage_finish_rpcs.sql');

    expect(sql).toContain('from public.online_match_results r');
    expect(sql).toContain("raise exception 'Match result not found for rating apply'");
    expect(sql).toContain(
      "lower(trim(v_match.reason)) not in ('king_capture', 'checkmate', 'resign', 'disconnect')",
    );
    expect(sql).toContain("raise exception 'Match rating inputs do not match recorded result'");
    expect(sql).toContain("raise exception 'User does not belong to match'");
  });

  it('does not use trigger-only OLD references in RLS migrations', () => {
    const sql = read(
      'supabase/migrations/20260619155000_rls_minimize_stage_clear_and_owned_pieces.sql',
    );

    expect(sql.includes('OLD.')).toBe(false);
  });
});

describe('deprecated unsafe endpoints', () => {
  it('keeps direct stage clear rewards disabled', () => {
    const source = read('src/server/handlers/v1/stages/clear.ts');

    expect(source).toContain("jsonError('GONE'");
    expect(source.includes('grantStageClearRewards')).toBe(false);
  });

  it('keeps client-side PvP rating apply disabled', () => {
    const source = read('src/server/handlers/v1/me/pvp-rating-apply.ts');

    expect(source).toContain("jsonError('GONE'");
    expect(source.includes('opponentRating')).toBe(false);
    expect(source.includes('recordMatch')).toBe(false);
  });

  it('allows PvP rating fallback only in tests', () => {
    const source = read('src/services/pvp-rating.ts');

    expect(source).toContain("if (process.env.NODE_ENV !== 'test') return false;");
  });
});
