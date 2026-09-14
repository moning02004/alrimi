"use client";

import { useState } from "react";
import { HiEllipsisVertical } from "react-icons/hi2";
import { BottomSheet } from "./BottomSheet";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /**
   * 되돌릴 수 없는 것. 빨갛게 적고 따로 떼어 놓는다 — 손가락이 미끄러져 한 칸 옆을
   * 눌렀을 때 수정하려다 지우는 일이 없어야 한다.
   */
  danger?: boolean;
  disabled?: boolean;
}

/**
 * 점 세 개를 눌러 여는 조작 목록. 머리글에 조작을 여럿 세워두는 대신 쓴다.
 *
 * 글자 버튼을 나란히 놓으면 화면 맨 위 좁은 줄에 눌러야 할 것이 셋씩 늘어서서,
 * 정작 이 화면의 주인공(일정)보다 먼저 눈에 든다. 게다가 그중 하나가 삭제라
 * 되돌릴 수 없는 조작이 늘 손끝 한 번 거리에 서 있게 된다.
 *
 * **떠오르는 작은 목록이 아니라 아래에서 올라오는 시트다.** 이 앱은 폰으로 한 손에
 * 들고 쓰는 것이라, 화면 맨 위에서 열리는 목록은 엄지가 닿지 않는 자리에 뜬다.
 * 시트로 올리면 고르는 자리가 손이 있는 아래쪽이고, 과녁도 줄 하나만큼 커진다.
 * 이 앱의 다른 고르기(등록·수정·다시 잡기)가 전부 같은 시트라 여닫는 법도 같다.
 */
export function Menu({ items, ariaLabel = "더보기" }: { items: MenuItem[]; ariaLabel?: string }) {
  const [open, setOpen] = useState(false);

  // 삭제 같은 것은 아래 따로 선다. 한 묶음에 같이 두면 바로 윗칸을 노리다 빗맞는다.
  const safe = items.filter((item) => !item.danger);
  const danger = items.filter((item) => item.danger);

  const pick = (item: MenuItem) => {
    setOpen(false);
    item.onSelect();
  };

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        /*
          44px 과녁. 보이는 그림은 20px 이지만 손가락으로 겨냥하는 자리는 그보다
          커야 한다 — 바로 왼쪽이 "뒤로" 라 빗맞으면 화면이 통째로 바뀐다.

          **넓힌 만큼은 음수 여백으로 도로 당긴다.** 안 그러면 이 44px 이 그대로
          줄 높이가 되어 머리글이 통째로 24px 높아진다(글자 버튼일 때는 20px 줄이었다).
          머리글은 붙박이라 그 24px 이 스크롤하는 내내 본문을 덮는다.

          `-my-3` 은 이 버튼이 놓이는 줄의 세로 여백(`py-3` = 12px)을 상쇄하는 값이다
          — 44 − 24 = 20px 이 되어 글자 한 줄과 같은 자리를 차지한다. 다른 여백을 쓰는
          줄에 옮겨 놓으면 이 값도 같이 고쳐야 한다.
        */
        className={`-my-3 -mr-2 flex h-11 w-11 items-center justify-center rounded-full
                    transition-colors hover:bg-paper ${open ? "bg-paper text-ink" : "text-muted"}`}
      >
        <HiEllipsisVertical className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* 제목은 두지 않는다 — 줄 셋이 스스로를 설명하는데 그 위에 "메뉴" 라고 한 줄
          더 얹으면, 고를 것보다 이름표가 먼저 읽힌다. 낭독기에는 아래 설명이 간다. */}
      <BottomSheet open={open} onOpenChange={setOpen} description={ariaLabel}>
        <div className="pb-2">
          <MenuGroup items={safe} onPick={pick} />
          {danger.length > 0 && (
            <div className="mt-2.5">
              <MenuGroup items={danger} onPick={pick} />
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  );
}

/** 한 묶음. 이 앱의 다른 목록(알림 목록)과 같은 카드 모양이다 */
function MenuGroup({ items, onPick }: { items: MenuItem[]; onPick: (item: MenuItem) => void }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => onPick(item)}
          className={`w-full px-4 py-3.5 text-left text-base transition-colors
                      active:bg-paper disabled:opacity-50 sm:hover:bg-paper ${
                        item.danger ? "text-red-600" : "text-ink"
                      }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
