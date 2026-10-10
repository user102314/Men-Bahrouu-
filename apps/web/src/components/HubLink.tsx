import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { hubUrl } from "../lib/hub-url.js";
import { connectLive, type LinkState } from "../lib/live.js";
import { queryClient } from "../lib/query.js";
import { useSession } from "../lib/session.js";

const LinkContext = createContext<LinkState>("reconnecting");

export function useLink(): LinkState {
  return useContext(LinkContext);
}

export function HubLinkProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const [health, setHealth] = useState<boolean | null>(null);
  const [socketState, setSocketState] = useState<LinkState>("reconnecting");

  useEffect(() => {
    let stop = false;
    async function ping(): Promise<void> {
      try {
        await fetch(`${hubUrl()}/health`);
        if (!stop) {
          setHealth(true);
        }
      } catch {
        if (!stop) {
          setHealth(false);
        }
      }
    }
    void ping();
    const id = window.setInterval(() => void ping(), 4000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }
    return connectLive(session.token, queryClient, setSocketState);
  }, [session]);

  const link: LinkState =
    health === false ? "unreachable" : health === null ? "reconnecting" : !session ? "connected" : socketState;

  return <LinkContext.Provider value={link}>{children}</LinkContext.Provider>;
}
