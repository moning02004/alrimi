import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "일정 알리미",
  description: "적어두면 때맞춰 알려드려요",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "일정 알리미" },
};

export const viewport: Viewport = {
  themeColor: "#2f7a63",
  width: "device-width",
  initialScale: 1,
  // maximumScale 은 두지 않는다 — 확대를 막으면 눈이 어두운 사람이 읽을 방법이
  // 없어진다(WCAG 1.4.4). iOS 가 입력칸에서 멋대로 확대하는 것을 막으려고 넣는
  // 값인데, 그 확대는 글씨가 16px 보다 작을 때만 일어나고 이 앱의 입력칸은
  // 모두 text-base(16px)라 애초에 해당하지 않는다.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
      </head>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
