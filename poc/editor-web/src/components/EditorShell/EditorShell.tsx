import type { ReactNode } from "react";

type EditorShellProps = {
  toolbar: ReactNode;
  mediaBin: ReactNode;
  preview: ReactNode;
  inspector: ReactNode;
  timeline: ReactNode;
  diagnostics?: ReactNode;
  status: ReactNode;
};

export function EditorShell({
  toolbar,
  mediaBin,
  preview,
  inspector,
  timeline,
  diagnostics,
  status,
}: EditorShellProps) {
  return (
    <main className="editorShell">
      <header className="editorTop panel">{toolbar}</header>

      <aside className="editorLeft panel resizablePane">{mediaBin}</aside>

      <section className="editorCenter panel">{preview}</section>

      <aside className="editorRight panel resizablePane">{inspector}</aside>

      <section className="editorBottom panel">{timeline}</section>

      {diagnostics ? <section className="editorDiagnostics panel">{diagnostics}</section> : null}

      <footer className="editorStatus panel log">{status}</footer>
    </main>
  );
}
