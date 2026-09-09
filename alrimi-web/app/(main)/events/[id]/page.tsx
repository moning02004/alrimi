"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { EventDetail } from "@/components/EventDetail";
import { pageUrl } from "@/constants/routeUrl";

/** 전체 화면으로 보는 자리. 모바일과, PC 에서 링크로 곧장 들어온 경우다 */
export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  return (
    <EventDetail
      eventId={Number(id)}
      onClose={() => router.back()}
      onDeleted={() => router.replace(pageUrl.home)}
    />
  );
}
