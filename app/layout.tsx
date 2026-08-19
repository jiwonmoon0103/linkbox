import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "linkbox",
  description: "나중에 볼 링크를 붙여넣으면 AI가 요약과 태그를 붙여 정리해주는 개인용 링크 보관함",
  // 주소를 아는 사람에게만 공개한다는 전제이므로 검색엔진에 올리지 않는다.
  // 이게 없으면 저장한 주소와 요약이 통째로 검색 결과에 뜬다. (PRD.md 7번)
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
