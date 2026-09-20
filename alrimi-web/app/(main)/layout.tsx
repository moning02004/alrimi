"use client";

import {usePathname} from "next/navigation";
import {useAuthBootstrap} from "@/hooks/useAuthBootstrap";
import {useMe} from "@/hooks/useMe";
import {LoadingScreen} from "@/components/Loading";
import {TabBar} from "@/components/TabBar";
import {SideNav} from "@/components/SideNav";
import {BottomSheet} from "@/components/BottomSheet";
import {EventForm} from "@/components/EventForm";
import {ZoneChangeSheet} from "@/components/ZoneChangeSheet";
import {OfflineBanner} from "@/components/OfflineBanner";
import {useAddSheet} from "@/store/ui";

export default function MainLayout({children}: { children: React.ReactNode }) {
    const {ready, authenticated, offline} = useAuthBootstrap();
    /*
      내 정보를 먼저 받아둔다. 여기서 쓰지는 않지만, 아래 화면들이 곧바로 꺼내 쓰도록
      (같은 질의라 캐시를 나눠 쓴다) 이 자리에서 한 번 부르고 기다린다.
    */
    const {isPending: mePending} = useMe(ready && authenticated);
    const {open, initialDate, openAdd, closeAdd} = useAddSheet();
    const pathname = usePathname();

    /**
     * 일정 상세에서는 탭바를 감춘다.
     *
     * 그 화면은 하나를 들여다보는 자리고 나가는 길이 이미 머리글의 "← 뒤로"다.
     * 탭바를 두면 나가는 문이 둘이 되는데 둘이 가는 곳이 다르다(뒤로 vs 홈).
     * 알림을 손으로 밀어보는 버튼도 여기 있어서, 아래를 비워두는 편이 낫다.
     */
    const bare = pathname.startsWith("/events/");

    // 인증을 확인하는 동안 하얗게 두면 고장과 구분되지 않는다.
    // 확인이 끝났는데 토큰이 없으면 로그인으로 넘어가는 중이라 아무것도 그리지 않는다.
    if (!ready) return <LoadingScreen/>;
    if (!authenticated) return null;
    // 오프라인 보기에서는 내 정보를 받을 수 없다. 받아둔 것이 없어도 기다리지 않고 연다.
    if (mePending && !offline) return <LoadingScreen/>;

    return (
        <div className="app-shell flex w-full overflow-hidden">
            {/*
              `md`(768px)부터 나온다(`hidden md:flex`). 폰에서는 자리도 차지하지 않는다.

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
                <OfflineBanner/>
                <div className="app-scroll">{children}</div>
                {/* 아래 탭바는 폰 전용 — 태블릿·PC 에서는 옆 기둥이 대신한다 */}
                {!bare && <TabBar/>}
            </div>

            <BottomSheet
                open={open}
                onOpenChange={(next) => (next ? openAdd(initialDate ?? undefined) : closeAdd())}
                title="일정 등록"
            >
                <EventForm initialDate={initialDate} onDone={closeAdd}/>
            </BottomSheet>

            {/*
              목록 카드의 공간 딱지를 누르면 열린다. 카드마다 달지 않고 여기 하나만
              둔다 — 목록에 있는 카드 수만큼 시트가 생기지 않도록(`store/ui.ts`).
            */}
            <ZoneChangeSheet/>
        </div>
    );
}
