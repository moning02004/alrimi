import Link from "next/link";
import type { IconType } from "react-icons";
import {
  LuBellRing,
  LuCalendarDays,
  LuCalendarRange,
  LuCheckCheck,
  LuCloudOff,
  LuPalette,
  LuSearch,
  LuSmartphone,
  LuUsers,
} from "react-icons/lu";
import { pageUrl } from "@/constants/routeUrl";
import { Logo } from "@/components/Logo";

/**
 * 소개 화면. 주소의 뿌리(`/`)이고 로그인 없이 열린다.
 *
 * 예전에는 여기서 곧장 `/home` 으로 넘겼는데, 그러면 이 앱이 무엇인지 볼 자리가 없었다. 홈은
 * 로그인해야 열리므로 안 들어가 본 사람은 로그인 화면만 보고 돌아섰다.
 *
 * **설치한 앱은 이 화면을 지나치지 않는다** — PWA 의 시작 주소가 `/home` 이라 매일 쓰는
 * 사람은 곧장 목록으로 간다(`public/manifest.json`).
 *
 * 서버에서 그려 내보낸다(클라이언트 훅이 없다). 로그인 여부로 갈라지지 않아서, 첫 그림이 곧
 * 완성된 화면이다.
 */
export default function IntroPage() {
  return (
    <main className="pb-16">
      {/* 초록 띠는 앱을 열었을 때의 색이다. 그 위에 한 줄 소개와 로그인 버튼이 선다 */}
      <div className="bg-gradient-to-b from-pinelt to-paper px-5 pb-12 pt-12 sm:pt-16">
        <div className="mx-auto w-full max-w-2xl text-center">
          <div className="flex items-center justify-center gap-2.5">
            <Logo size={36} />
            <p className="text-lg font-semibold tracking-tight">일정 알리미</p>
          </div>

          <h1 className="mt-6 text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
            어린이집 안내문,
            <br />
            냉장고에 붙여만 두지 마세요
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
            &ldquo;내일 뭐 챙겨 보내야 하더라?&rdquo; 그 질문에 답하려고 만들었습니다. 날짜와
            준비물을 적어두면 챙겨야 할 때 알림이 옵니다.
          </p>

          <Link
            href={pageUrl.login}
            className="mt-7 inline-block rounded-xl bg-pine px-8 py-3.5 text-base font-medium
                       text-white transition-colors hover:bg-pine/90"
          >
            로그인
          </Link>
          <p className="mt-2.5 text-xs text-muted">계정은 관리자가 발급합니다</p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-5">
        <Section title="이렇게 씁니다">
          <ol className="divide-y divide-line rounded-2xl border border-line bg-card">
            <Step n={1} title="공간을 만듭니다">
              어린이집, 우리집, 회사. 섞이면 아침에 훑기 어려우니 처음부터 나눠둡니다. 공간마다
              색이 따로 정해져서 목록에서 한눈에 갈립니다.
            </Step>
            <Step n={2} title="일정을 적고, 언제 알릴지 고릅니다">
              제목과 준비물, 그리고 &ldquo;하루 전 저녁 8시&rdquo; 처럼 알릴 시점을 고릅니다.
              매주 수요일 체육복처럼 되풀이되는 것은 반복으로 한 번만 적어둡니다.
            </Step>
            <Step n={3} title="때가 되면 알림이 옵니다">
              브라우저 알림으로 먼저 가고, 닿지 않으면 ntfy 앱으로 갑니다. 같은 알림을 두 번 받지
              않도록 한 길로만 보냅니다.
            </Step>
          </ol>
        </Section>

        <Section title="가족과 함께 봅니다">
          <div className="rounded-2xl border border-line bg-card p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pinelt text-pine">
                <LuUsers className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted">
                함께 볼 사람을 한 번 정해두고, 공간마다 &lsquo;함께 보기&rsquo;를 켜면 그 공간의
                일정을 같이 봅니다. 아빠가 적어둔 어린이집 일정을 엄마도 보고, 알림도 함께
                받습니다. 허락하면 함께 고칠 수도 있어요. 회사 공간처럼 혼자 볼 것은 꺼두면 됩니다.
              </p>
            </div>
          </div>
        </Section>

        <Section title="이런 것도 있습니다">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Feature icon={LuCalendarRange} title="여러 날 일정">
              사흘짜리 여행은 한 건입니다. 달력에 띠로 이어지고 카드에는 &ldquo;2/3&rdquo; 이 붙어요.
            </Feature>
            <Feature icon={LuCheckCheck} title="완료와 보류">
              끝낸 것은 완료로 덮고, 미룬 것은 지우는 대신 보류함에 둡니다. 날짜만 다시 고르면
              알림도 따라옵니다.
            </Feature>
            <Feature icon={LuCalendarDays} title="공휴일과 절기">
              달력에 빨간 날과 절기가 함께 보입니다. 무슨 색으로 볼지는 각자 고릅니다.
            </Feature>
            <Feature icon={LuSearch} title="찾기">
              &ldquo;소풍 언제였지&rdquo; 는 제목·내용 검색으로 찾습니다. 지난 일정까지 함께요.
            </Feature>
            <Feature icon={LuBellRing} title="구글 캘린더">
              연결해두면 일정이 구글 캘린더에도 담깁니다. 알리미가 원본이고 구글은 사본이에요.
            </Feature>
            <Feature icon={LuCloudOff} title="연결이 없어도">
              받아둔 일정은 지하철에서도 열립니다. 그때는 읽기만 되고, 연결되면 다시 맞춰집니다.
            </Feature>
            <Feature icon={LuPalette} title="색만으로 나누지 않습니다">
              공간은 색과 머리글자 두 가지로 갈립니다. 색이 잘 안 갈리는 눈에도 읽히도록 맞췄어요.
            </Feature>
            <Feature icon={LuSmartphone} title="홈 화면 앱">
              PWA라 홈 화면에 추가하면 주소창 없이 앱처럼 열리고, 알림도 앱처럼 옵니다.
            </Feature>
          </div>
        </Section>

        <Section title="앱처럼 설치해서 써보세요">
          <div className="rounded-2xl border border-line bg-card p-5 text-sm leading-relaxed text-muted">
            모바일 브라우저 메뉴(⋮)에서 <strong className="font-medium text-ink">홈 화면에 추가</strong>
            를 고르면 주소창 없이 열립니다. 아이폰은 사파리의 공유 버튼에서 같은 항목을 고르면
            되고, 그렇게 추가해야 알림도 받을 수 있어요.
          </div>
        </Section>

        <section className="mt-10 rounded-2xl bg-ink px-5 py-8 text-center text-white">
          <p className="text-base font-semibold">계정이 필요하신가요?</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/70">
            회원가입은 없습니다. 쓰는 사람이 정해진 앱이라 관리자가 아이디를 만들어 드려요. 받은
            비밀번호는 처음 로그인할 때 바꾸게 됩니다.
          </p>
          <Link
            href={pageUrl.login}
            className="mt-5 inline-block rounded-xl bg-card px-6 py-3 text-sm font-medium text-ink
                       transition-colors hover:bg-paper"
          >
            로그인
          </Link>
        </section>

        <p className="mt-6 text-center">
          <Link href={pageUrl.privacy} className="text-xs text-muted underline hover:text-pine">
            개인정보처리방침
          </Link>
        </p>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 px-1 text-base font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

/** 번호가 뜻을 갖는 자리다 — 실제로 이 순서로 쓴다 */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5 p-5">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pinelt
                   text-sm font-semibold text-pine"
      >
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>
      </div>
    </li>
  );
}

function Feature({
  icon: Icon,
  title,
  children,
}: {
  icon: IconType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
        {title}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}
