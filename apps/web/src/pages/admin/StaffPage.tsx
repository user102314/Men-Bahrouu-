import { newId, type Role } from "@resto/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { OneTimeSecretDialog } from "../../components/admin/OneTimeSecretDialog.js";
import {
  ConfirmDialog,
  ErrorState,
  FormSection,
  PageHeader,
  StatusBadge,
  fieldClass,
} from "../../components/admin/widgets.js";
import { Button } from "../../components/ui/button.js";
import { adminApi, type StaffUser } from "../../lib/admin-api.js";
import { hubErrorText } from "../../lib/errors.js";
import { useSession } from "../../lib/session.js";

const ROLES = ["ADMIN", "CASHIER", "WAITER"] as const;
type RoleFilter = "ALL" | Role;

export function StaffPage() {
  const { t } = useTranslation();
  const session = useSession();
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: () => adminApi.users() });
  const [filter, setFilter] = useState<RoleFilter>("ALL");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("WAITER");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [roleFor, setRoleFor] = useState<string | null>(null);
  const [nextRole, setNextRole] = useState<Role>("WAITER");
  const [roleEmail, setRoleEmail] = useState("");
  const [rolePassword, setRolePassword] = useState("");
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  const create = useMutation({
    mutationFn: () =>
      adminApi.createUser({
        id: newId(),
        displayName: name.trim(),
        role,
        ...(role === "ADMIN" ? { email: email.trim(), password } : {}),
      }),
    onSuccess: async (created) => {
      setName("");
      setEmail("");
      setPassword("");
      if (created.pin) {
        setSecret(created.pin);
      }
      await refresh();
    },
  });
  const rename = useMutation({
    mutationFn: () => adminApi.updateUser(editing ?? "", { displayName: nameDraft.trim() }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const changeRole = useMutation({
    mutationFn: (person: StaffUser) => {
      const nextEmail = roleEmail.trim() || person.email;
      return adminApi.setUserRole(person.id, {
        role: nextRole,
        ...(nextRole === "ADMIN" && nextEmail ? { email: nextEmail } : {}),
        ...(nextRole === "ADMIN" && rolePassword ? { password: rolePassword } : {}),
      });
    },
    onSuccess: async (result) => {
      setRoleFor(null);
      setRolePassword("");
      if (result.pin) {
        setSecret(result.pin);
      }
      await refresh();
    },
  });
  const resetPin = useMutation({
    mutationFn: (id: string) => adminApi.resetUserPin(id),
    onSuccess: async (result) => {
      setSecret(result.pin);
      await refresh();
    },
  });
  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      adminApi.setUserActive(id, active),
    onSuccess: async () => {
      setDeactivateId(null);
      await refresh();
    },
  });

  const error =
    users.error ??
    create.error ??
    rename.error ??
    changeRole.error ??
    resetPin.error ??
    setActive.error;
  const listed = (users.data ?? []).filter((person) => filter === "ALL" || person.role === filter);
  const adminReady = role !== "ADMIN" || (email.trim().length > 0 && password.length >= 8);
  const hints: Record<Role, string> = {
    ADMIN: t("admin.staffRoleAdmin"),
    CASHIER: t("admin.staffRoleCashier"),
    WAITER: t("admin.staffRoleWaiter"),
  };

  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader title={t("admin.nav.staff")} />
      <p className="text-sm text-ink/70">{t("admin.staffHelp")}</p>
      {error ? <ErrorState>{hubErrorText(error, t)}</ErrorState> : null}
      <div className="grid gap-2 md:grid-cols-3">
        {ROLES.map((item) => (
          <button
            key={item}
            type="button"
            className={`rounded-[14px] border p-3 text-start ${
              filter === item ? "border-primary bg-primary text-white" : "border-line bg-surface"
            }`}
            onClick={() => {
              setFilter(item);
              setRole(item);
            }}
          >
            <span className="block font-display text-xl">{t(`status.${item}`)}</span>
            <span
              className={`mt-1 block text-sm ${filter === item ? "text-white/80" : "text-ink/70"}`}
            >
              {hints[item]}
            </span>
          </button>
        ))}
      </div>
      <FilterChip active={filter === "ALL"} onClick={() => setFilter("ALL")}>
        {t("admin.staffAll")}
      </FilterChip>
      <FormSection title={t("admin.create")}>
        <input
          className={fieldClass}
          placeholder={t("admin.staffName")}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <select
          className={fieldClass}
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
        >
          {ROLES.map((item) => (
            <option key={item} value={item}>
              {t(`status.${item}`)}
            </option>
          ))}
        </select>
        {role === "ADMIN" ? (
          <>
            <input
              className={fieldClass}
              type="email"
              placeholder={t("admin.staffEmail")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <input
              className={fieldClass}
              type="password"
              placeholder={t("admin.staffPassword")}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="text-sm text-ink/70">{t("admin.staffPasswordHelp")}</p>
          </>
        ) : (
          <p className="text-sm text-ink/70">{t("admin.staffPinHelp")}</p>
        )}
        <Button
          intent="primary"
          disabled={name.trim().length === 0 || !adminReady || create.isPending}
          onClick={() => create.mutate()}
        >
          {t("admin.create")}
        </Button>
      </FormSection>
      {ROLES.filter((item) => filter === "ALL" || filter === item).map((item) => {
        const group = listed.filter((person) => person.role === item);
        if (group.length === 0) {
          return null;
        }
        return (
          <section key={item} className="grid gap-2">
            <h2 className="font-display text-xl">{t(`status.${item}`)}</h2>
            {group.map((person) => (
              <article
                key={person.id}
                className={`grid gap-3 rounded-[14px] border border-line bg-surface p-3 ${person.isActive ? "" : "opacity-70"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium break-words">
                    {person.displayName}
                    {session?.userId === person.id ? (
                      <span className="ms-2 text-sm text-primary">{t("admin.staffYou")}</span>
                    ) : null}
                  </p>
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={person.role} />
                    <span className="text-sm text-ink/70">
                      {person.isActive ? t("admin.active") : t("admin.inactive")}
                    </span>
                  </span>
                </div>
                {person.email ? (
                  <p className="text-sm text-ink/70 break-all">{person.email}</p>
                ) : null}
                {editing === person.id ? (
                  <div className="flex flex-wrap gap-2">
                    <input
                      className={`${fieldClass} min-w-0 flex-1`}
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                    />
                    <Button
                      intent="primary"
                      disabled={nameDraft.trim().length === 0}
                      onClick={() => rename.mutate()}
                    >
                      {t("admin.save")}
                    </Button>
                    <Button onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
                  </div>
                ) : null}
                {roleFor === person.id ? (
                  <div className="grid gap-2 rounded-[12px] bg-fond p-3">
                    <select
                      className={fieldClass}
                      value={nextRole}
                      onChange={(event) => setNextRole(event.target.value as Role)}
                    >
                      {ROLES.map((choice) => (
                        <option key={choice} value={choice}>
                          {t(`status.${choice}`)}
                        </option>
                      ))}
                    </select>
                    {nextRole === "ADMIN" ? (
                      <>
                        <input
                          className={fieldClass}
                          type="email"
                          placeholder={t("admin.staffEmail")}
                          value={roleEmail}
                          onChange={(event) => setRoleEmail(event.target.value)}
                        />
                        <input
                          className={fieldClass}
                          type="password"
                          placeholder={t("admin.staffPassword")}
                          value={rolePassword}
                          onChange={(event) => setRolePassword(event.target.value)}
                        />
                      </>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        intent="primary"
                        disabled={!roleReady(person, nextRole, roleEmail, rolePassword)}
                        onClick={() => changeRole.mutate(person)}
                      >
                        {t("admin.save")}
                      </Button>
                      <Button onClick={() => setRoleFor(null)}>{t("common.cancel")}</Button>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      setEditing(person.id);
                      setNameDraft(person.displayName);
                      setRoleFor(null);
                    }}
                  >
                    {t("admin.edit")}
                  </Button>
                  <Button
                    onClick={() => {
                      setRoleFor(person.id);
                      setNextRole(person.role);
                      setRoleEmail(person.email ?? "");
                      setRolePassword("");
                      setEditing(null);
                    }}
                  >
                    {t("admin.staffSaveRole")}
                  </Button>
                  {person.role !== "ADMIN" ? (
                    <Button onClick={() => resetPin.mutate(person.id)}>
                      {t("admin.staffResetPin")}
                    </Button>
                  ) : null}
                  {session?.userId !== person.id ? (
                    person.isActive ? (
                      <Button intent="danger" onClick={() => setDeactivateId(person.id)}>
                        {t("admin.deactivate")}
                      </Button>
                    ) : (
                      <Button onClick={() => setActive.mutate({ id: person.id, active: true })}>
                        {t("admin.activate")}
                      </Button>
                    )
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        );
      })}
      <OneTimeSecretDialog
        open={secret !== null}
        secret={secret ?? ""}
        title={t("admin.staffPinTitle")}
        hint={t("admin.staffPinOnce")}
        onClose={() => setSecret(null)}
      />
      <ConfirmDialog
        open={deactivateId !== null}
        title={t("admin.deactivate")}
        onClose={() => setDeactivateId(null)}
        onConfirm={() => {
          if (deactivateId) {
            setActive.mutate({ id: deactivateId, active: false });
          }
        }}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      className={`min-h-11 rounded-[12px] border px-3 text-sm ${active ? "border-primary bg-primary text-white" : "border-line bg-surface"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function roleReady(person: StaffUser, next: Role, email: string, password: string): boolean {
  if (next !== "ADMIN") {
    return next !== person.role;
  }
  const emailOk = email.trim().length > 0 || Boolean(person.email);
  const passwordOk = person.hasPassword || password.length >= 8;
  return (
    emailOk &&
    passwordOk &&
    (next !== person.role || password.length >= 8 || email.trim() !== (person.email ?? ""))
  );
}
