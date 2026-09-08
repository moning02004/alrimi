"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { BottomSheet } from "./BottomSheet";
import { useChangePassword, useUpdateMe } from "@/hooks/useMe";
import { firstError } from "@/lib/api";
import type { Me } from "@/types";

const inputCls =
  "w-full rounded-xl border border-line bg-card px-3.5 py-3 text-base " +
  "placeholder:text-muted/50 focus:border-pine focus:outline-none";
const submitCls =
  "my-3 w-full rounded-xl bg-pine py-3.5 text-base font-medium text-white disabled:opacity-60";

export function NameSheet({ me, open, onClose }: { me?: Me; open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onOpenChange={(next) => !next && onClose()} title="이름 변경">
      {/* key 로 다시 마운트해 열 때마다 지금 값으로 시작한다 */}
      {open && <NameForm key={me?.name ?? ""} me={me} onClose={onClose} />}
    </BottomSheet>
  );
}

function NameForm({ me, onClose }: { me?: Me; onClose: () => void }) {
  const [name, setName] = useState(me?.name ?? "");
  const update = useUpdateMe();

  const save = () => {
    const trimmed = name.trim();
    if (trimmed === (me?.name ?? "")) return onClose();

    update.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          toast.success("이름을 바꿨어요");
          onClose();
        },
        onError: (error) => toast.error(firstError(error, "바꾸지 못했어요")),
      },
    );
  };

  return (
    <>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        maxLength={255}
        placeholder={me?.username}
        className={inputCls}
      />
      <p className="mb-3 px-1 pt-1.5 text-xs text-muted">비워두면 아이디가 대신 보여요.</p>
      <button onClick={save} disabled={update.isPending} className={submitCls}>
        {update.isPending ? "저장하는 중" : "저장하기"}
      </button>
    </>
  );
}

export function PasswordSheet({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  /** 비밀번호를 바꾸면 서버가 세션을 끊는다. 다시 로그인시켜야 한다 */
  onChanged: () => void;
}) {
  return (
    <BottomSheet open={open} onOpenChange={(next) => !next && onClose()} title="비밀번호 변경">
      {open && <PasswordForm onChanged={onChanged} />}
    </BottomSheet>
  );
}

function PasswordForm({ onChanged }: { onChanged: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const change = useChangePassword();

  const submit = () => {
    if (!current || !next) {
      setError("빈 칸을 채워주세요");
      return;
    }
    // 서버는 확인란을 모른다. 오타로 못 들어가는 일이 없도록 여기서 본다.
    if (next !== confirm) {
      setError("새 비밀번호가 서로 달라요");
      return;
    }

    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          toast.success("비밀번호를 바꿨어요. 다시 로그인해주세요");
          onChanged();
        },
        onError: (err) => setError(firstError(err, "바꾸지 못했어요")),
      },
    );
  };

  return (
    <>
      <div className="space-y-2.5">
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
            setError(null);
          }}
          placeholder="현재 비밀번호"
          className={inputCls}
        />
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
            setError(null);
          }}
          placeholder="새 비밀번호"
          className={inputCls}
        />
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="새 비밀번호 확인"
          className={inputCls}
        />
      </div>

      {error && <p className="mt-2 px-1 text-sm text-red-600">{error}</p>}

      <p className="px-1 pt-2 text-xs text-muted">바꾸면 로그인 화면으로 돌아가요.</p>
      <button onClick={submit} disabled={change.isPending} className={submitCls}>
        {change.isPending ? "바꾸는 중" : "바꾸기"}
      </button>
    </>
  );
}
