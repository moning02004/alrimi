"use client";

import {useEffect} from "react";
import {usePathname} from "next/navigation";
import {useAuthBootstrap} from "@/hooks/useAuthBootstrap";
import {LoadingScreen} from "@/components/Loading";
import {TabBar} from "@/components/TabBar";
import {SideNav} from "@/components/SideNav";
import {BottomSheet} from "@/components/BottomSheet";
import {NoticeForm} from "@/components/NoticeForm";
import {useAddSheet} from "@/store/ui";

export default function MainLayout({children}: { children: React.ReactNode }) {
    const {ready, authenticated} = useAuthBootstrap();
    const {open, initialDate, openAdd, closeAdd} = useAddSheet();
    const pathname = usePathname();

    /**
     * 일정 상세에서는 탭바를 감춘다.
     *
     * 그 화면은 하나를 들여다보는 자리고 나가는 길이 이미 머리글의 "← 뒤로"다.
     * 탭바를 두면 나가는 문이 둘이 되는데 둘이 가는 곳이 다르다(뒤로 vs 홈).
     * 알림을 손으로 밀어보는 버튼도 여기 있어서, 아래를 비워두는 편이 낫다.
     */
    const bare = pathname.startsWith("/notices/");

    /**
     * 키보드로 일정 등록. 마우스를 탭바까지 내렸다 올리지 않아도 된다.
     *
     * 글자 하나짜리 단축키라 입력 중에는 받지 않는다 — 제목에 "n" 을 치는 순간
     * 시트가 열려버리면 못 쓴다. 조합키가 눌린 것도 넘긴다(Cmd+N 은 새 창이다).
     */
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "n" || e.metaKey || e.ctrlKey || e.altKey || open) return;
            const el = e.target as HTMLElement | null;
            if (el?.isContentEditable || /^(input|textarea|select)$/i.test(el?.tagName ?? "")) return;
            e.preventDefault();
            openAdd();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, openAdd]);

    // 인증을 확인하는 동안 하얗게 두면 고장과 구분되지 않는다.
    // 확인이 끝났는데 토큰이 없으면 로그인으로 넘어가는 중이라 아무것도 그리지 않는다.
    if (!ready) return <LoadingScreen/>;
    if (!authenticated) return null;

    return (
        <div className="app-shell flex w-full overflow-hidden">
            {/*
              PC 에서만 나온다(`hidden lg:flex`). 모바일에서는 자리도 차지하지 않는다.

              일정 상세에서도 그대로 둔다 — 탭바를 감추는 까닭은 좁은 화면에서
              나가는 문이 둘이 되면 헷갈려서인데, 여기는 본문 옆에 따로 선 기둥이라
              겹치지 않는다. 오히려 PC 에서 이것까지 감추면 상세에 들어간 순간
              이동할 방법이 "← 뒤로" 하나만 남는다.
            */}
            <SideNav/>

            {/*
              높이를 90vh/10vh 로 갈라 쓰지 않는다. 탭바의 실제 높이는
              56px + 안전영역 + 테두리라 기기마다 다른데, 90vh 에 그걸 더하면
              100vh 를 넘어서 탭바가 화면 밖으로 밀린다. 남는 자리를 flex 가
              계산하게 두면 어느 기기에서든 정확히 맞는다.

              `min-w-0` 은 옆 기둥이 생겼을 때 이 칸이 내용 폭만큼 버티지 않고
              남는 자리에 맞춰 줄어들게 한다.
            */}
            <div className="mx-auto flex w-full min-w-0 max-w-md flex-col overflow-hidden
                            sm:max-w-2xl lg:max-w-6xl">
                <div className="app-scroll">{children}</div>
                {/* 아래 탭바는 모바일 전용 — PC 에서는 옆 기둥이 대신한다 */}
                {!bare && <TabBar/>}
            </div>

            <BottomSheet
                open={open}
                onOpenChange={(next) => (next ? openAdd(initialDate ?? undefined) : closeAdd())}
                title="일정 등록"
            >
                <NoticeForm initialDate={initialDate} onDone={closeAdd}/>
            </BottomSheet>
        </div>
    );
}
