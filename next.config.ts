import type { NextConfig } from "next";

// 모든 응답에 붙이는 보안 헤더
// 근거: PRD.md 7번(보안 검토), 배포 전 보안 점검
//
// CSP(Content-Security-Policy)는 넣지 않았다.
// Next.js가 화면을 그릴 때 인라인 스크립트를 쓰기 때문에 잘못 잡으면
// 화면이 통째로 깨진다. 넣으려면 실제 화면을 보며 하나씩 맞춰야 한다.
const securityHeaders = [
  // 다른 사이트가 이 화면을 iframe으로 덮어씌우지 못하게 한다.
  { key: "X-Frame-Options", value: "DENY" },

  // 브라우저가 파일 종류를 제멋대로 추측하지 않게 한다.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // 다른 사이트로 이동할 때 어떤 주소에서 왔는지 자세히 알려주지 않는다.
  // 저장한 링크를 열 때 검색어가 담긴 주소가 새어 나가지 않게 하려는 것이다.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // 한 번 https로 접속한 뒤에는 http로 내려가지 않게 한다.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },

  // 이 앱은 카메라, 마이크, 위치를 쓰지 않는다.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
