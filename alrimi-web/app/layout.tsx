import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "./providers";
import "./globals.css";

/**
 * 글꼴은 앱과 함께 나간다. 예전에는 CDN 에서 받아왔는데, 그쪽이 느리거나 막히면 첫 화면의
 * 글꼴이 한 번 바뀌었고 연결이 없을 때는 아예 다른 글꼴로 떴다. 여기 담아두면 서비스 워커가
 * 앱 껍데기와 함께 받아두므로 오프라인에서도 같은 화면이다.
 *
 * 하나짜리 가변 폰트라 굵기마다 파일을 받지 않는다(2MB 한 번).
 */
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  weight: "45 920",
  variable: "--font-pretendard",
  display: "swap",
});

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
    <html lang="ko" className={pretendard.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
