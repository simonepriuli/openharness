import { useCallback, useEffect, useState } from "react";
import type { OAuthDeviceCodePayload, OAuthProviderInfo } from "../../../../preload/api";
import { ChatGptIcon } from "../icons/ChatGptIcon";
import { OAuthDeviceCodeModal } from "./OAuthDeviceCodeModal";
import { SettingsCard } from "./SettingsCard";

const CODEX_FOR_OSS_URL = "https://developers.openai.com/community/codex-for-oss";

type OAuthProvidersSettingsProps = {
  saving: boolean;
  onSettingsChanged?: () => void;
};

type ProviderOAuthState = {
  error: string | null;
  statusMessage: string | null;
};

function emptyOAuthState(): ProviderOAuthState {
  return { error: null, statusMessage: null };
}

export function OAuthProvidersSettings({
  saving,
  onSettingsChanged,
}: OAuthProvidersSettingsProps) {
  const [providers, setProviders] = useState<OAuthProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [oauthState, setOauthState] = useState<Record<string, ProviderOAuthState>>({});
  const [connectingProviderId, setConnectingProviderId] = useState<string | null>(null);
  const [deviceCode, setDeviceCode] = useState<OAuthDeviceCodePayload | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await window.harness.getOAuthProviders();
      setProviders(next);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load OAuth providers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateOAuthState = (providerId: string, patch: Partial<ProviderOAuthState>) => {
    setOauthState((prev) => ({
      ...prev,
      [providerId]: { ...(prev[providerId] ?? emptyOAuthState()), ...patch },
    }));
  };

  useEffect(() => {
    const unsubscribeDeviceCode = window.harness.onOAuthDeviceCode((payload) => {
      setDeviceCode(payload);
      updateOAuthState(payload.providerId, { error: null });
    });
    const unsubscribeProgress = window.harness.onOAuthLoginProgress((payload) => {
      setProgressMessage(payload.message);
    });
    const unsubscribeComplete = window.harness.onOAuthLoginComplete((payload) => {
      setConnectingProviderId(null);
      setDeviceCode(null);
      setProgressMessage(null);
      updateOAuthState(payload.providerId, {
        error: null,
        statusMessage: "Connected.",
      });
      void reload();
      onSettingsChanged?.();
    });
    const unsubscribeFailed = window.harness.onOAuthLoginFailed((payload) => {
      setConnectingProviderId(null);
      setDeviceCode(null);
      setProgressMessage(null);
      updateOAuthState(payload.providerId, {
        error: payload.message,
        statusMessage: null,
      });
    });

    return () => {
      unsubscribeDeviceCode();
      unsubscribeProgress();
      unsubscribeComplete();
      unsubscribeFailed();
    };
  }, [onSettingsChanged, reload]);

  const closeModal = useCallback(() => {
    void window.harness.cancelOAuthLogin();
    setConnectingProviderId(null);
    setDeviceCode(null);
    setProgressMessage(null);
  }, []);

  const handleConnect = async (provider: OAuthProviderInfo) => {
    updateOAuthState(provider.id, { error: null, statusMessage: null });
    setDeviceCode(null);
    setProgressMessage(null);
    setConnectingProviderId(provider.id);
    try {
      await window.harness.startOAuthLogin({ providerId: provider.id });
    } catch (err) {
      setConnectingProviderId(null);
      updateOAuthState(provider.id, {
        error: err instanceof Error ? err.message : "Failed to start OAuth login",
      });
    }
  };

  const handleDisconnect = async (provider: OAuthProviderInfo) => {
    updateOAuthState(provider.id, { error: null, statusMessage: null });
    try {
      await window.harness.logoutOAuthProvider({ providerId: provider.id });
      updateOAuthState(provider.id, {
        statusMessage: "Disconnected.",
      });
      await reload();
      onSettingsChanged?.();
    } catch (err) {
      updateOAuthState(provider.id, {
        error: err instanceof Error ? err.message : "Failed to disconnect",
      });
    }
  };

  if (loading) {
    return <p className="settings-muted">Loading OAuth providers…</p>;
  }

  if (loadError) {
    return <p className="settings-error">{loadError}</p>;
  }

  return (
    <>
      {providers.map((provider) => {
        const state = oauthState[provider.id] ?? emptyOAuthState();
        const isConnecting = connectingProviderId === provider.id;
        const connected = provider.configured;

        return (
          <SettingsCard key={provider.id} padded={false}>
            <div className="settings-row settings-row-static settings-row-static-top">
              <div className="settings-row-text">
                <div className="settings-row-label settings-row-label-with-icon">
                  <ChatGptIcon size={16} />
                  {provider.displayName}
                </div>
                <p className="settings-row-description">
                  Use your ChatGPT Plus or Pro subscription instead of an OpenAI Platform API key.
                  Credentials are stored in Pi&apos;s <code>auth.json</code> and refresh
                  automatically. Separate from the OpenAI API key under Cloud providers.{" "}
                  <a
                    className="settings-link settings-link-inline"
                    href={CODEX_FOR_OSS_URL}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => {
                      event.preventDefault();
                      void window.harness.openExternal({ url: CODEX_FOR_OSS_URL });
                    }}
                  >
                    Learn more
                  </a>
                </p>
                {connected ? (
                  <p className="settings-muted settings-row-feedback">
                    {provider.accountHint
                      ? `Connected as ${provider.accountHint}.`
                      : "Connected."}{" "}
                    Add Codex models in Chat settings.{" "}
                    <button
                      type="button"
                      className="settings-link settings-link-inline"
                      disabled={saving || connectingProviderId !== null}
                      onClick={() => void handleDisconnect(provider)}
                    >
                      Disconnect
                    </button>
                  </p>
                ) : (
                  <p className="settings-muted settings-row-feedback">
                    Sign in with your ChatGPT account to use Codex models without an API key.
                  </p>
                )}
                {state.error ? (
                  <p className="settings-error settings-row-feedback">{state.error}</p>
                ) : null}
                {state.statusMessage ? (
                  <p className="settings-status settings-row-feedback">{state.statusMessage}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="settings-button settings-button-secondary settings-action-button"
                disabled={saving || (connectingProviderId !== null && !isConnecting)}
                onClick={() => void handleConnect(provider)}
              >
                {isConnecting ? "Connecting…" : connected ? "Reconnect" : "Connect"}
              </button>
            </div>
          </SettingsCard>
        );
      })}

      <OAuthDeviceCodeModal
        open={connectingProviderId !== null}
        deviceCode={deviceCode}
        progressMessage={progressMessage}
        onCancel={closeModal}
      />
    </>
  );
}
