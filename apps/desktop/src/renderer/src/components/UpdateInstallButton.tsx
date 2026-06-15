import { useAppUpdate } from "../hooks/useAppUpdate";

export function UpdateInstallButton() {
  const { status, version, install } = useAppUpdate();

  if (status !== "downloaded") {
    return null;
  }

  const title = version ? `Install update v${version}` : "Install update";
  return (
    <button
      type="button"
      className="update-install-button"
      onClick={install}
      title={title}
    >
      Update
    </button>
  );
}
