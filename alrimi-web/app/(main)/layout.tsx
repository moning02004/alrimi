"use client";

import {usePathname} from "next/navigation";
import {useAuthBootstrap} from "@/hooks/useAuthBootstrap";
import {TabBar} from "@/components/TabBar";
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

    if (!ready || !authenticated) return null;

    return (
        <div className="mx-auto flex min-h-screen w-full flex-col overflow-hidden">
            <div className="flex-1 max-h-[90vh] overflow-y-scroll">{children}</div>
            {!bare && <TabBar/>}

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
