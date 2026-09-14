"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { apiUrl } from "@/constants/routeUrl";
import { buildMarks, type MarkMap } from "@/lib/marks";
import type { MarkColor, MarkKind, MarkStyle, SpecialDay } from "@/types";

export const specialDayKeys = {
  range: (from: string, to: string) => ["special-days", from, to] as const,
  styles: ["mark-styles"] as const,
  palette: ["mark-palette"] as const,
};

/** 한 해에 한 번 바뀔까 말까인 자료다. 창을 앞뒤로 넘기는 동안 다시 받을 까닭이 없다 */
const A_LONG_WHILE = 12 * 60 * 60 * 1000;

/** 보고 있는 기간의 특일. 색은 `buildMarks` 가 설정에서 가져와 얹는다 */
export function useSpecialDayRows(from: string, to: string) {
  return useQuery({
    queryKey: specialDayKeys.range(from, to),
    queryFn: () => api.get<SpecialDay[]>(apiUrl.specialDays(from, to)),
    staleTime: A_LONG_WHILE,
    gcTime: 24 * 60 * 60 * 1000,
    // 기간을 옮기면 키가 바뀌어 잠깐 빈다. 그 사이 표시가 사라졌다 돌아오면
    // 달을 넘기는 동안 화면이 깜빡인다.
    placeholderData: (previous) => previous,
  });
}

/**
 * 종류별 색. 저장된 줄이 없어도 서버가 기본값으로 채워 주므로 이쪽에서
 * "없으면 기본값" 을 다시 적지 않는다.
 */
export function useMarkStyles() {
  return useQuery({
    queryKey: specialDayKeys.styles,
    queryFn: () => api.get<MarkStyle[]>(apiUrl.markStyles),
    staleTime: A_LONG_WHILE,
  });
}

/** 고를 수 있는 색. 서버가 쥐고 있어야 저장할 때 걸러낼 수 있다 */
export function useMarkPalette() {
  return useQuery({
    queryKey: specialDayKeys.palette,
    queryFn: () => api.get<MarkColor[]>(apiUrl.markPalette),
    staleTime: Infinity,
  });
}

/**
 * 한 종류의 색을 고친다.
 *
 * 돌아오는 것이 목록 전체라 그대로 캐시에 얹는다. 다시 받아올 필요가 없고,
 * 달력이 같은 렌더에서 새 색으로 그려진다.
 */
export function useUpdateMarkStyle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, color }: { kind: MarkKind; color: string }) =>
      api.patch<MarkStyle[]>(apiUrl.markStyle(kind), { color }),
    onSuccess: (styles) => qc.setQueryData(specialDayKeys.styles, styles),
  });
}

/**
 * 달력이 바로 쓰는 모양 — 날짜 → 그 날의 표시들(색까지 얹은).
 *
 * 자료와 설정을 따로 받아 여기서 합친다. 둘의 수명이 달라서다: 특일은 한 해에 한 번
 * 바뀌고 창마다 다른 기간을 받지만, 설정은 사람마다 하나이고 바꾸는 순간 모든
 * 기간에 같이 반영돼야 한다.
 */
export function useMarks(from: string, to: string): MarkMap {
  const rows = useSpecialDayRows(from, to).data;
  const styles = useMarkStyles().data;

  // 기억해둔다. 매 렌더 새 객체를 만들면 달력이 받는 값이 늘 달라져서,
  // 아무것도 안 바뀐 렌더에도 42칸을 다시 그린다.
  return useMemo(
    () => (rows?.length && styles?.length ? buildMarks(rows, styles) : EMPTY),
    [rows, styles],
  );
}

/** 빈 결과도 같은 객체를 돌려줘야 위의 기억이 헛돌지 않는다 */
const EMPTY: MarkMap = {};
