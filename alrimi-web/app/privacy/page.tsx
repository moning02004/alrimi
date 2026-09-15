import type { Metadata } from "next";
import Link from "next/link";
import { pageUrl } from "@/constants/routeUrl";

export const metadata: Metadata = {
  title: "개인정보처리방침 · 일정 알리미",
  description: "일정 알리미가 어떤 정보를 왜 받고, 어디에 두고, 언제 지우는지",
};

/** 바뀌면 여기와 아래 "변경" 절을 함께 고친다 */
const EFFECTIVE_DATE = "2026년 9월 15일";
const OPERATOR = "유정훈";
const CONTACT = "moning15112@gmail.com";

/**
 * 개인정보처리방침. **로그인 없이 열려야 한다** — 구글 OAuth 앱 게시·검증 심사가
 * 공개된 주소를 요구하고, 아직 계정이 없는 사람도 읽을 수 있어야 한다. 그래서
 * 인증을 거는 `(main)` 묶음 밖에 둔다.
 *
 * **코드가 실제로 하는 일만 적는다.** 여기 적힌 것과 다르게 동작하면 그 자체가
 * 구글 사용자 데이터 정책 위반이다. 저장하는 항목·외부로 나가는 곳·보관 기간을
 * 바꾸면 이 페이지도 같이 고친다.
 *
 * - 저장 항목: `accounts.models` · `zones.models` · `notices.models` ·
 *   `special_days.models` · `google_calendar.models`
 * - 브라우저 저장: refresh 쿠키(`accounts/cookies.py`), 구글 연결 확인 쿠키
 *   (`google_calendar/views.py`), localStorage(`store/zone.ts` · `store/ui.ts`)
 * - 구글로 보내는 것: `google_calendar/sync.py` 의 `event_body`
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10 text-[15px] leading-relaxed">
      <Link href={pageUrl.login} className="text-sm text-pine">
        ← 일정 알리미
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">개인정보처리방침</h1>
      <p className="mt-2 text-sm text-muted">시행일 {EFFECTIVE_DATE}</p>

      <p className="mt-6">
        일정 알리미(이하 &ldquo;서비스&rdquo;)는 어린이집·학교 안내문 같은 일정을 적어두면 정한
        때에 알림을 보내주는 서비스입니다. 운영자 {OPERATOR}(이하 &ldquo;운영자&rdquo;)는
        서비스를 제공하는 데 필요한 만큼만 정보를 받고, 그 정보를 어떻게 다루는지 아래에
        밝힙니다.
      </p>

      <Section title="1. 받는 정보">
        <p>회원가입 기능은 없습니다. 계정은 운영자가 직접 발급합니다.</p>
        <Items
          rows={[
            ["계정", "아이디, 이름(선택), 비밀번호, 마지막 로그인 시각. 비밀번호는 복원할 수 없는 해시로만 저장합니다."],
            ["일정", "공간 이름과 색, 일정 제목·내용·날짜·시각, 알림 시점과 발송 여부, 완료·보류 표시"],
            ["달력 표시 설정", "공휴일·절기를 어떤 색으로 볼지"],
            ["알림 받기", "브라우저 알림을 켠 기기의 푸시 구독 정보(푸시 서비스 주소와 암호화 키), 기기를 구분하기 위한 브라우저 정보(User-Agent), 마지막 발송 시각. ntfy 앱으로 받을 때 쓰는 구독 토픽."],
            ["구글 캘린더 연동", "연동을 켠 경우에만: 구글 계정 이메일 주소, 구글이 발급한 인증 토큰, 서비스가 만든 캘린더의 ID, 마지막 반영 시각과 실패 사유"],
            ["접속 기록", "서버가 요청을 처리하면서 남기는 IP 주소, 요청 주소, 시각"],
          ]}
        />
      </Section>

      <Section title="2. 쓰는 목적">
        <ul className="list-disc space-y-1 pl-5">
          <li>로그인과 계정 유지</li>
          <li>일정과 알림 예약을 저장하고, 정한 시각에 알림 보내기</li>
          <li>연동을 켠 경우 일정을 구글 캘린더에 반영하기</li>
          <li>장애 확인과 부정 이용 방지</li>
        </ul>
        <p>광고, 마케팅, 이용 행태 분석에는 쓰지 않습니다.</p>
      </Section>

      <Section title="3. 구글 사용자 데이터">
        <p>
          설정에서 구글 캘린더를 연결하면 서비스는 아래 권한만 요청합니다.
        </p>
        <Items
          rows={[
            ["openid, email", "어느 구글 계정에 연결했는지 설정 화면에 표시하기 위해 이메일 주소를 받습니다."],
            [
              "calendar.app.created",
              "서비스 전용 캘린더(“일정 알리미”)를 하나 만들고, 그 캘린더 안에서만 일정을 추가·수정·삭제합니다. 이 권한으로는 이용자의 다른 캘린더와 그 일정을 읽을 수 없습니다.",
            ],
          ]}
        />
        <p>
          구글로 보내는 것은 일정의 제목(공간 이름 포함), 내용, 날짜와 시각입니다. 보류한
          일정은 구글 캘린더에서 지웁니다. 전용 캘린더에 무엇이 들어 있는지는 알리미와 맞추기
          위해 일정 ID 목록만 읽습니다.
        </p>
        <p>
          구글에서 받은 정보는 위 기능을 제공하는 데에만 쓰며, 판매하거나 광고에 쓰거나 다른
          곳으로 넘기지 않습니다. 보안 사고 조사나 법령상 의무, 이용자가 요청한 경우를 빼면
          사람이 그 내용을 들여다보지 않습니다.
        </p>
        <p className="rounded-xl border border-line bg-card px-4 py-3 text-sm">
          일정 알리미가 Google API로부터 받은 정보를 사용하고 다른 앱으로 전송하는 것은 제한된
          사용(Limited Use) 요건을 포함한{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="text-pine underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API 서비스 사용자 데이터 정책
          </a>
          을 준수합니다.
          <span className="mt-2 block text-muted">
            일정 알리미&apos;s use and transfer to any other app of information received from
            Google APIs will adhere to the Google API Services User Data Policy, including the
            Limited Use requirements.
          </span>
        </p>
        <p>
          연결은 언제든 끊을 수 있습니다. 설정 → 연동 → 구글 캘린더에서 <b>끊기</b>를 누르면
          저장된 토큰과 이메일을 지우고, 구글에 권한 취소를 요청하고, 서비스가 만든 캘린더도
          함께 지웁니다.{" "}
          <a
            href="https://myaccount.google.com/permissions"
            className="text-pine underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            구글 계정의 서드파티 액세스
          </a>
          에서 직접 권한을 거둘 수도 있습니다.
        </p>
      </Section>

      <Section title="4. 외부로 나가는 정보">
        <p>
          정보를 판매하거나 제3자에게 제공하지 않습니다. 다만 기능을 제공하려면 아래 곳으로
          정보가 오갑니다.
        </p>
        <Items
          rows={[
            ["Google", "구글 캘린더 연동을 켠 경우, 3절에 적은 일정 정보"],
            [
              "브라우저 푸시 서비스",
              "브라우저 알림을 켠 경우, 기기 제조사·브라우저가 운영하는 푸시 서비스(Google, Mozilla, Apple 등)를 거쳐 알림이 전달됩니다. 알림 내용은 기기의 키로 암호화되어 푸시 서비스는 읽을 수 없습니다.",
            ],
            ["jsDelivr", "화면 글꼴(Pretendard)을 이 CDN에서 받아옵니다. 이때 브라우저의 IP 주소가 전달됩니다."],
          ]}
        />
        <p>
          ntfy 알림 서버와 알림 발송 예약을 돌리는 서버는 운영자가 직접 운영하며 외부 업체에
          맡기지 않습니다.
        </p>
      </Section>

      <Section title="5. 브라우저에 저장하는 것">
        <Items
          rows={[
            ["로그인 유지 쿠키", "다시 로그인하지 않도록 30일 동안 둡니다. 스크립트가 읽을 수 없는(httpOnly) 쿠키이며, 로그아웃하면 지웁니다."],
            ["구글 연결 확인 쿠키", "구글 동의 화면에서 돌아온 브라우저가 연결을 시작한 그 브라우저인지 확인합니다. 10분 뒤 사라집니다."],
            ["로컬 저장소", "마지막으로 고른 공간, PC 화면의 옆 메뉴를 접었는지"],
          ]}
        />
        <p>광고·분석용 쿠키나 추적 도구는 쓰지 않습니다.</p>
      </Section>

      <Section title="6. 보관과 삭제">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            계정과 일정은 계정이 있는 동안 보관합니다. 완료한 일정도 기록으로 남기며, 이용자가
            지우면 바로 삭제됩니다.
          </li>
          <li>브라우저 알림 구독은 알림을 끄거나 구독이 만료되면 삭제됩니다.</li>
          <li>구글 연동 정보는 연결을 끊으면 바로 삭제됩니다.</li>
          <li>
            계정 삭제를 요청하면 그 계정의 공간·일정·알림 구독·구글 연동 정보를 모두 지웁니다.
          </li>
        </ul>
      </Section>

      <Section title="7. 이용자의 권리">
        <p>
          이용자는 자기 정보를 열람·정정·삭제하거나 처리 정지를 요구할 수 있습니다. 일정과
          이름은 서비스 안에서 직접 고치거나 지울 수 있고, 계정 삭제와 그 밖의 요청은 아래
          연락처로 보내주시면 지체 없이 처리합니다.
        </p>
      </Section>

      <Section title="8. 안전하게 지키기 위한 조치">
        <ul className="list-disc space-y-1 pl-5">
          <li>모든 통신은 HTTPS로 암호화합니다.</li>
          <li>비밀번호는 복원할 수 없는 해시로만 저장합니다.</li>
          <li>로그인 토큰은 스크립트가 읽을 수 없는 쿠키와 메모리에만 둡니다.</li>
          <li>구글 인증 토큰은 서버에만 두고 화면이나 관리 도구에 표시하지 않습니다.</li>
        </ul>
      </Section>

      <Section title="9. 개인정보 보호책임자와 연락처">
        <Items
          rows={[
            ["책임자", OPERATOR],
            ["이메일", CONTACT],
          ]}
        />
        <p className="text-sm text-muted">
          개인정보 침해에 대한 상담이 필요하면 개인정보침해신고센터(privacy.kisa.or.kr, 국번 없이
          118)에 문의할 수 있습니다.
        </p>
      </Section>

      <Section title="10. 변경">
        <p>
          이 방침을 바꾸면 이 페이지에 시행일과 함께 알립니다. 받는 정보나 쓰는 목적이 늘어나는
          변경은 시행 전에 서비스 안에서도 알립니다.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/** 항목 이름과 설명. 표 대신 목록이다 — 폰 폭에서 두 칸짜리 표는 설명이 한 줄에 몇 글자씩 꺾인다 */
function Items({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-line rounded-xl border border-line bg-card">
      {rows.map(([name, detail]) => (
        <div key={name} className="px-4 py-3 sm:flex sm:gap-4">
          <dt className="shrink-0 font-medium sm:w-36">{name}</dt>
          <dd className="mt-1 text-muted sm:mt-0">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}
