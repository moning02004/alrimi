"use client";

import { useEffect, useState } from "react";
import { LuPlus, LuSearch } from "react-icons/lu";
import { useUserSearch } from "@/hooks/useZones";
import type { UserSummary } from "@/types";

/** 입력을 이만큼 멈추면 찾는다 */
const DEBOUNCE_MS = 200;

/**
 * 함께 볼 사람을 이름이나 아이디로 찾아 고른다.
 *
 * 고른 뒤 무엇을 할지는 부르는 쪽이 정한다(`onPick`). 공간을 만드는 중이면 목록에
 * 담아두기만 하고, 이미 있는 공간이면 누르는 즉시 추가한다.
 *
 * 이미 고른 사람·이미 함께 보는 사람은 결과에서 뺀다(`excludeIds`). 남겨두면 같은
 * 사람을 두 번 누르고 "이미 함께 보고 있어요" 를 받는다.
 */
export function PeoplePicker({
  id,
  excludeIds,
  onPick,
  disabled = false,
}: {
  id: string;
  excludeIds: number[];
  onPick: (user: UserSummary) => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const search = useUserSearch(query);
  const term = query.trim();
  const results = term ? (search.data ?? []).filter((user) => !excludeIds.includes(user.id)) : [];

  return (
    <div>
      <div className="relative">
        <LuSearch
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        />
        <label htmlFor={id} className="sr-only">
          함께 볼 사람 찾기
        </label>
        <input
          id={id}
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="이름이나 아이디로 찾기"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-3 text-base
                     placeholder:text-muted/50 focus:border-pine focus:outline-none
                     [&::-webkit-search-cancel-button]:hidden"
        />
      </div>

      {term && (
        <ul className="mt-1.5 divide-y divide-line rounded-xl border border-line bg-card" aria-live="polite">
          {search.isLoading ? (
            <li className="px-3.5 py-2.5 text-sm text-muted">찾는 중</li>
          ) : results.length === 0 ? (
            <li className="px-3.5 py-2.5 text-sm text-muted">
              &lsquo;{term}&rsquo;에 맞는 사람이 없어요
            </li>
          ) : (
            results.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(user);
                    // 한 사람을 고르면 칸을 비운다. 다음 사람을 바로 찾게
                    setInput("");
                    setQuery("");
                  }}
                  disabled={disabled}
                  className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left
                             transition-colors hover:bg-paper disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{user.name || user.username}</span>
                    <span className="block truncate text-xs text-muted">{user.username}</span>
                  </span>
                  <LuPlus className="h-4 w-4 shrink-0 text-pine" aria-label="추가" role="img" />
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
