"use client";

import toast from "react-hot-toast";
import { LuLogOut, LuUserMinus } from "react-icons/lu";
import { firstError } from "@/lib/api";
import {
  useAddSharing,
  useLeaveSharing,
  useReceivedSharing,
  useRemoveSharing,
  useSharing,
} from "@/hooks/useZones";
import { ErrorBlock, LoadingBlock } from "./Loading";
import { PeoplePicker } from "./PeoplePicker";
import type { UserSummary } from "@/types";

const iconButtonCls = `-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full
                       text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60`;

const displayName = (person: UserSummary) => person.name || person.username;

function PersonRow({ person, action }: { person: UserSummary; action: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm">{displayName(person)}</p>
        <p className="truncate text-xs text-muted">{person.username}</p>
      </div>
      {action}
    </li>
  );
}

/**
 * 내 공간을 함께 보는 사람. **사람마다 한 번** 정한다.
 *
 * 여기서 정한 사람들은 "함께 보기" 를 켠 공간을 모두 본다 — 공간마다 사람을 다시 고르지
 * 않는다. 가족은 잘 바뀌지 않고, 바뀌는 것은 "이 공간을 같이 볼까" 쪽이다.
 *
 * 설정의 한 묶음이기도 하고, 공간을 만들며 함께 보기를 켰는데 아직 아무도 없을 때
 * 그 자리에서 바로 더하는 자리이기도 하다(`compact`).
 */
export function SharingPeople({ compact = false }: { compact?: boolean }) {
  const { data: people, isLoading, isError, refetch } = useSharing();
  const add = useAddSharing();
  const remove = useRemoveSharing();

  const pick = (user: UserSummary) =>
    add.mutate(user.id, {
      onSuccess: () => toast.success(`${displayName(user)} 님과 함께 봐요`),
      onError: (error) => toast.error(firstError(error, "추가하지 못했어요")),
    });

  const stop = (person: UserSummary) => {
    if (!confirm(`${displayName(person)} 님에게 더는 공간을 보여주지 않을까요? 알림도 더는 가지 않아요.`)) return;
    remove.mutate(person.id, {
      onSuccess: () => toast.success("뺐어요"),
      onError: (error) => toast.error(firstError(error, "빼지 못했어요")),
    });
  };

  if (isLoading) return <LoadingBlock />;
  if (isError) return <ErrorBlock onRetry={() => refetch()} />;

  return (
    <div className="space-y-2">
      {people && people.length > 0 ? (
        <ul className="divide-y divide-line rounded-xl border border-line bg-card">
          {people.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              action={
                /*
                  글자 대신 아이콘이다. 사람 줄마다 빨간 글자가 서면 목록이 경고문처럼 읽힌다.
                  되돌릴 수 없어 누르면 한 번 더 묻는다.
                */
                <button
                  type="button"
                  onClick={() => stop(person)}
                  disabled={remove.isPending}
                  aria-label={`${displayName(person)} 빼기`}
                  title="빼기"
                  className={iconButtonCls}
                >
                  <LuUserMinus className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
              }
            />
          ))}
        </ul>
      ) : (
        <p className="px-1 text-xs text-muted">
          {compact
            ? "아직 함께 보는 사람이 없어요. 찾아서 더하면 이 공간이 그 사람에게도 보여요."
            : "아직 함께 보는 사람이 없어요."}
        </p>
      )}

      <PeoplePicker
        id={compact ? "sharing-people-compact" : "sharing-people"}
        excludeIds={(people ?? []).map((person) => person.id)}
        onPick={pick}
        disabled={add.isPending}
      />
    </div>
  );
}

/**
 * 나에게 공간을 보여주는 사람. 받는 쪽도 누구 것을 받는지 보고 그만 받을 수 있어야 한다 —
 * "왜 아빠 일정이 내 목록에 있지" 에 답하는 자리다. 아무도 없으면 묶음째 그리지 않는다.
 */
export function ReceivedSharing({ heading }: { heading: React.ReactNode }) {
  const { data: people } = useReceivedSharing();
  const leave = useLeaveSharing();

  if (!people || people.length === 0) return null;

  const stop = (person: UserSummary) => {
    if (!confirm(`${displayName(person)} 님의 공간을 그만 볼까요? 그 공간의 일정과 알림이 더는 오지 않아요.`)) return;
    leave.mutate(person.id, {
      onSuccess: () => toast.success(`${displayName(person)} 님의 공간을 그만 봐요`),
      onError: (error) => toast.error(firstError(error, "바꾸지 못했어요")),
    });
  };

  return (
    <>
      {heading}
      <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
        {people.map((person) => (
          <PersonRow
            key={person.id}
            person={person}
            action={
              <button
                type="button"
                onClick={() => stop(person)}
                disabled={leave.isPending}
                aria-label={`${displayName(person)} 님의 공간 그만 보기`}
                title="그만 보기"
                className={iconButtonCls}
              >
                <LuLogOut className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            }
          />
        ))}
      </ul>
    </>
  );
}
