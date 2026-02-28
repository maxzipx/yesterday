"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import BriefEditor from "@/app/admin/brief-editor";
import RssIngestPanel from "@/app/admin/rss-ingest-panel";
import ClusterPanel from "@/app/admin/cluster-panel";
import RankPanel from "@/app/admin/rank-panel";
import CandidatesPanel from "@/app/admin/candidates-panel";
import type { CandidateStoryAssignment, CandidateStoryAssignmentEvent } from "@/app/admin/types";

type AdminAuthState =
  | { kind: "checking" }
  | { kind: "logged_out"; error?: string }
  | { kind: "unauthorized"; email: string }
  | { kind: "authorized"; email: string };

type AuthorizationResponse = {
  authenticated: boolean;
  authorized: boolean;
  email: string | null;
  error?: string;
};

async function checkAdminAuthorization(
  accessToken: string,
): Promise<AuthorizationResponse> {
  const response = await fetch("/api/admin/authorize", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as AuthorizationResponse;
  return payload;
}

export default function AdminGate() {
  const { supabase, clientError } = useMemo(() => {
    try {
      return { supabase: getSupabaseBrowserClient(), clientError: null as string | null };
    } catch (error) {
      return {
        supabase: null,
        clientError:
          error instanceof Error ? error.message : "Supabase is not configured.",
      };
    }
  }, []);
  const [authState, setAuthState] = useState<AdminAuthState>({ kind: "checking" });
  const [assignmentEvent, setAssignmentEvent] =
    useState<CandidateStoryAssignmentEvent | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let active = true;

    const syncState = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) {
        return;
      }

      if (error || !data.session?.access_token) {
        setAuthState({
          kind: "logged_out",
          error: error?.message,
        });
        return;
      }

      try {
        const authorization = await checkAdminAuthorization(data.session.access_token);
        if (!active) {
          return;
        }

        if (!authorization.authenticated || !authorization.email) {
          setAuthState({ kind: "logged_out", error: authorization.error });
          return;
        }

        if (!authorization.authorized) {
          setAuthState({ kind: "unauthorized", email: authorization.email });
          return;
        }

        setAuthState({ kind: "authorized", email: authorization.email });
      } catch {
        if (!active) {
          return;
        }

        setAuthState({
          kind: "logged_out",
          error: "Could not verify admin authorization.",
        });
      }
    };

    void syncState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.access_token) {
        setAuthState({ kind: "logged_out" });
        return;
      }

      void checkAdminAuthorization(session.access_token)
        .then((authorization) => {
          if (!active) {
            return;
          }

          if (!authorization.authenticated || !authorization.email) {
            setAuthState({ kind: "logged_out", error: authorization.error });
            return;
          }

          if (!authorization.authorized) {
            setAuthState({ kind: "unauthorized", email: authorization.email });
            return;
          }

          setAuthState({ kind: "authorized", email: authorization.email });
        })
        .catch(() => {
          if (!active) {
            return;
          }

          setAuthState({
            kind: "logged_out",
            error: "Could not verify admin authorization.",
          });
        });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const onSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) {
      return;
    }
    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: emailInput.trim(),
      password: passwordInput,
    });

    if (error) {
      setAuthState({
        kind: "logged_out",
        error: error.message,
      });
      setIsSubmitting(false);
      return;
    }

    setPasswordInput("");
    setIsSubmitting(false);
  };

  const onSignOut = async () => {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
    setAuthState({ kind: "logged_out" });
  };

  const onAssignStory = (assignment: CandidateStoryAssignment) => {
    setAssignmentEvent({
      id: Date.now(),
      payload: assignment,
    });
  };

  if (clientError) {
    return (
      <section className="page-stack">
        <h1 className="page-heading">Admin</h1>
        <article className="card">
          <h2>Configuration required</h2>
          <p>{clientError}</p>
        </article>
      </section>
    );
  }

  if (authState.kind === "checking") {
    return (
      <section className="page-stack">
        <h1 className="page-heading">Admin</h1>
        <article className="card">
          <p>Checking session...</p>
        </article>
      </section>
    );
  }

  if (authState.kind === "logged_out") {
    return (
      <section className="page-stack">
        <h1 className="page-heading">Admin Login</h1>
        <article className="card">
          <p>Sign in to access the admin dashboard.</p>
          <form className="form-grid" onSubmit={onSignIn}>
            <label className="field">
              <span>Email</span>
              <input
                className="input"
                type="email"
                autoComplete="email"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                required
              />
            </label>
            <button className="button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
          {authState.error ? <p className="error-text">{authState.error}</p> : null}
        </article>
      </section>
    );
  }

  if (authState.kind === "unauthorized") {
    return (
      <section className="page-stack">
        <h1 className="page-heading">Admin</h1>
        <article className="card">
          <h2>Not authorized</h2>
          <p>You are logged in as {authState.email}</p>
          <button className="button button-muted" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </article>
      </section>
    );
  }

  if (!supabase) {
    return null;
  }

  return (
    <section className="page-stack">
      <h1 className="page-heading">Admin Dashboard</h1>
      <article className="card">
        <p>You are logged in as {authState.email}</p>
        <button className="button button-muted" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </article>
      <RssIngestPanel supabase={supabase} />
      <ClusterPanel supabase={supabase} />
      <RankPanel supabase={supabase} />
      <CandidatesPanel supabase={supabase} onAssignStory={onAssignStory} />
      <BriefEditor supabase={supabase} assignmentEvent={assignmentEvent} />
    </section>
  );
}
