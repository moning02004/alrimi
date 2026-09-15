"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { BottomSheet } from "./BottomSheet";
import { firstError } from "@/lib/api";
import { useCreateUser, useDeleteUser, useUpdateUserRole, useUsers } from "@/hooks/useUsers";
import type { ManagedUser, Me } from "@/types";

// 설정 화면의 줄·묶음과 같은 모양이다(`app/(main)/settings/page.tsx`)
const rowCls = "flex items-center justify-between px-4 py-3 transition-colors hover:bg-paper";
const groupCls = "divide-y divide-line rounded-2xl border border-line bg-card";
const headCls = "px-1 pb-2 pt-5 text-xs font-medium text-muted";
const inputCls =
  "w-full rounded-xl border border-line bg-card px-3.5 py-3 text-base " +
  "placeholder:text-muted/50 focus:border-pine focus:outline-none";
const submitCls =
  "my-3 w-full rounded-xl bg-pine py-3.5 text-base font-medium text-white disabled:opacity-60";

/**
 * 설정의 "사용자 관리" 묶음. 관리자·최고 관리자에게만 나온다.
 *
 * - 관리자: 목록을 보고 **추가만** 한다. 줄을 눌러도 아무것도 열리지 않는다.
 * - 최고 관리자: 줄을 누르면 권한을 주고 지우는 시트가 열린다. 자기 줄은 빼고.
 *
 * 서버가 같은 경계로 막는다(`accounts.views`). 여기서 버튼을 감추는 것은 눌러봐야
 * 403 이 날 자리를 보여주지 않으려는 것이지 막는 수단이 아니다.
 */
export function UserAdminGroup({ me }: { me?: Me }) {
  const canAdd = Boolean(me && (me.is_staff || me.is_superuser));
  const superuser = Boolean(me?.is_superuser);
  const { data: users, isLoading } = useUsers(canAdd);
  const [creating, setCreating] = useState(false);
  const [managingId, setManagingId] = useState<number | null>(null);

  if (!canAdd) return null;

  return (
    <>
      <p className={headCls}>사용자 관리</p>
      <div className={groupCls}>
        {/* 줄 하나만큼 자리를 잡아둔다. 없다가 생기면 아래 묶음들이 밀린다 */}
        {isLoading && <div className="h-[58px]" aria-hidden="true" />}

        {users?.map((user) => {
          const self = user.username === me?.username;
          const body = (
            <>
              <div className="min-w-0">
                <p className="truncate text-sm">
                  {user.name || user.username}
                  {self && <span className="ml-1 text-xs text-muted">(나)</span>}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {user.username}
                  {/* 추가만 해두고 아직 안 들어온 사람. 0000 을 전해줬는지 되짚게 한다 */}
                  {user.must_change_password && " · 비밀번호 변경 전"}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-2">
                <RoleBadge user={user} />
                {superuser && !self && <span className="text-xs text-muted">관리 ›</span>}
              </span>
            </>
          );

          // 자기 자신은 권한도 삭제도 막혀 있으므로 누를 자리로 만들지 않는다
          return superuser && !self ? (
            <button
              key={user.id}
              onClick={() => setManagingId(user.id)}
              className={`${rowCls} w-full gap-3 text-left`}
            >
              {body}
            </button>
          ) : (
            <div key={user.id} className="flex items-center justify-between gap-3 px-4 py-3">
              {body}
            </div>
          );
        })}

        <div className="px-4 py-3">
          <button onClick={() => setCreating(true)} className="text-sm text-pine">
            + 사용자 추가
          </button>
        </div>
        <p className="px-4 py-3 text-xs leading-relaxed text-muted">
          {superuser
            ? "최고 관리자는 사용자를 추가하고, 권한을 주고, 삭제할 수 있어요."
            : "관리자는 사용자를 추가할 수 있어요. 권한 변경과 삭제는 최고 관리자만 할 수 있어요."}
        </p>
      </div>

      <UserCreateSheet open={creating} onClose={() => setCreating(false)} />
      <UserManageSheet userId={managingId} onClose={() => setManagingId(null)} />
    </>
  );
}

function RoleBadge({ user }: { user: ManagedUser }) {
  if (user.is_superuser) {
    return <span className="rounded-full bg-pinelt px-2 py-0.5 text-xs text-pine">최고 관리자</span>;
  }
  if (user.is_staff) {
    return (
      <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">관리자</span>
    );
  }
  return null;
}

function UserCreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onOpenChange={(next) => !next && onClose()} title="사용자 추가">
      {/* 열 때마다 다시 마운트되어 빈 칸으로 시작한다 */}
      {open && <CreateForm onClose={onClose} />}
    </BottomSheet>
  );
}

function CreateForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateUser();

  const submit = () => {
    const trimmedName = name.trim();
    const trimmedUsername = username.trim();
    if (!trimmedName || !trimmedUsername) {
      setError("이름과 아이디를 모두 적어주세요");
      return;
    }

    create.mutate(
      { name: trimmedName, username: trimmedUsername },
      {
        onSuccess: (user) => {
          toast.success(`${user.name} 님을 추가했어요`);
          onClose();
        },
        // 이미 있는 아이디 등. 어느 칸이 문제인지 서버가 말해준다
        onError: (err) => setError(firstError(err, "추가하지 못했어요")),
      },
    );
  };

  return (
    <>
      <div className="space-y-2.5">
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          maxLength={255}
          placeholder="이름"
          className={inputCls}
        />
        <input
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          maxLength={150}
          placeholder="아이디"
          // 아이디는 로그인에 그대로 쓰인다. 폰이 첫 글자를 대문자로 바꾸면 알려준 것과 달라진다
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={inputCls}
        />
      </div>

      {error && <p className="mt-2 px-1 text-sm text-red-600">{error}</p>}

      <div className="mt-3 space-y-1.5 rounded-xl border border-line bg-card px-3.5 py-3 text-xs leading-relaxed text-muted">
        <p>
          처음 비밀번호는 <b className="text-ink">0000</b> 으로 만들어져요. 추가한 사람에게 아이디와
          함께 알려주세요.
        </p>
        <p>
          처음 로그인하면 다른 화면으로 가기 전에 반드시 새 비밀번호로 바꿔야 해요. 0000 은 새
          비밀번호로 쓸 수 없어요.
        </p>
        <p>추가한 사람은 일반 사용자로 시작해요. 권한은 최고 관리자가 줄 수 있어요.</p>
      </div>

      <button onClick={submit} disabled={create.isPending} className={submitCls}>
        {create.isPending ? "추가하는 중" : "추가하기"}
      </button>
    </>
  );
}

/**
 * 한 사람의 권한과 삭제. 최고 관리자만 연다.
 *
 * 사람은 id 로 받아 목록에서 찾는다. 객체를 그대로 받으면 권한을 바꾼 뒤에도 연 순간의
 * 값이 남아 스위치가 제자리로 돌아간 것처럼 보인다.
 */
function UserManageSheet({ userId, onClose }: { userId: number | null; onClose: () => void }) {
  const { data: users } = useUsers(userId !== null);
  const user = users?.find((u) => u.id === userId);

  return (
    <BottomSheet
      open={userId !== null && Boolean(user)}
      onOpenChange={(next) => !next && onClose()}
      title="사용자 관리"
    >
      {user && <ManageForm key={user.id} user={user} onClose={onClose} />}
    </BottomSheet>
  );
}

function ManageForm({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const update = useUpdateUserRole();
  const remove = useDeleteUser();
  const [confirming, setConfirming] = useState(false);
  const label = user.name || user.username;

  const setRole = (roles: { is_staff?: boolean; is_superuser?: boolean }) =>
    update.mutate(
      { id: user.id, ...roles },
      { onError: (err) => toast.error(firstError(err, "권한을 바꾸지 못했어요")) },
    );

  return (
    <>
      <p className="px-1 text-sm">
        <span className="font-medium">{label}</span>{" "}
        <span className="text-muted">{user.username}</span>
      </p>

      <div className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
        <RoleSwitch
          label="관리자"
          hint="사용자를 추가할 수 있어요"
          on={user.is_staff}
          disabled={update.isPending}
          onToggle={() => setRole({ is_staff: !user.is_staff })}
        />
        <RoleSwitch
          label="최고 관리자"
          hint="권한을 주고 사용자를 삭제할 수 있어요. 켜면 관리자도 함께 켜지고, 관리자를 끄면 함께 꺼져요"
          on={user.is_superuser}
          disabled={update.isPending}
          onToggle={() => setRole({ is_superuser: !user.is_superuser })}
        />
      </div>

      {/*
        삭제는 한 번 더 묻는다. 공간·일정까지 통째로 지워지고 되돌릴 길이 없다.
        대화상자 대신 제자리에서 묻는다 — 이 앱의 다른 확인들도 시트 안에서 끝난다.
      */}
      <div className="my-4">
        {confirming ? (
          <div className="rounded-xl border border-red-200 bg-card px-4 py-3">
            <p className="text-sm">{label} 님을 삭제할까요?</p>
            <p className="mt-1 text-xs text-muted">
              공간·일정·알림 설정이 모두 지워지고 되돌릴 수 없어요.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-lg border border-line py-2 text-sm"
              >
                취소
              </button>
              <button
                onClick={() =>
                  remove.mutate(user.id, {
                    onSuccess: () => {
                      toast.success(`${label} 님을 삭제했어요`);
                      onClose();
                    },
                    onError: (err) => toast.error(firstError(err, "삭제하지 못했어요")),
                  })
                }
                disabled={remove.isPending}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm text-white disabled:opacity-60"
              >
                {remove.isPending ? "삭제하는 중" : "정말 삭제"}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="w-full rounded-xl border border-line bg-card py-3 text-sm text-red-600"
          >
            사용자 삭제
          </button>
        )}
      </div>
    </>
  );
}

function RoleSwitch({
  label,
  hint,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  hint: string;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        disabled={disabled}
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
          on ? "bg-pine" : "bg-line"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            on ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
