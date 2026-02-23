import { useMemo, useState } from "react";
import { createEmptyProject, type MavAsset } from "@mav/shared";

const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

type JobResponse = {
  jobId?: string;
  syncId?: string;
  status: string;
  provider: string;
};

export default function App() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [asset, setAsset] = useState<MavAsset | null>(null);
  const [log, setLog] = useState<string>("Pret.");

  const project = useMemo(() => createEmptyProject("Nouveau projet"), []);

  const onPickVideo = (file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setAsset({
      id: crypto.randomUUID(),
      name: file.name,
      src: url,
      type: "video"
    });
    setLog(`Media charge: ${file.name}`);
  };

  const callApi = async (path: string, body: object) => {
    const response = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(details || "Requete API en echec");
    }

    return (await response.json()) as JobResponse;
  };

  const generateSubtitles = async () => {
    if (!asset) return setLog("Charge une video avant de lancer les sous-titres.");
    try {
      const result = await callApi("/api/ai/subtitles", {
        mediaUrl: `file://${asset.name}`,
        language: "fr"
      });
      setLog(`Sous-titres: ${result.status} (${result.jobId ?? "n/a"})`);
    } catch (error) {
      setLog(`Erreur sous-titres: ${String(error)}`);
    }
  };

  const generateVoiceover = async () => {
    try {
      const result = await callApi("/api/ai/voiceover", {
        script: "Voice-over de test pour MAV.",
        language: "fr",
        voice: "default"
      });
      setLog(`Voix IA: ${result.status} (${result.jobId ?? "n/a"})`);
    } catch (error) {
      setLog(`Erreur voix IA: ${String(error)}`);
    }
  };

  const syncProject = async () => {
    try {
      const result = await callApi("/api/projects/sync", {
        projectId: project.id,
        title: asset?.name ?? "Projet MAV",
        exportPreset: "reels"
      });
      setLog(`Sync maxvideoai: ${result.status} (${result.syncId ?? "n/a"})`);
    } catch (error) {
      setLog(`Erreur sync: ${String(error)}`);
    }
  };

  return (
    <main className="shell">
      <header className="panel">
        <h1>MAV</h1>
        <p>Montage simple + IA + connexion maxvideoai.com</p>
      </header>

      <section className="panel">
        <label htmlFor="media">Importer un media video</label>
        <input
          id="media"
          type="file"
          accept="video/*"
          onChange={(e) => onPickVideo(e.target.files?.[0] ?? null)}
        />

        <div className="preview">
          {videoUrl ? (
            <video src={videoUrl} controls playsInline />
          ) : (
            <div className="placeholder">Apercu video</div>
          )}
        </div>
      </section>

      <section className="panel actions">
        <button onClick={generateSubtitles}>Generer sous-titres IA</button>
        <button onClick={generateVoiceover}>Generer voix IA</button>
        <button onClick={syncProject}>Sync vers maxvideoai.com</button>
        <button onClick={() => setLog("Export MP4 (a brancher FFmpeg).")}>
          Export MP4
        </button>
        <button onClick={() => setLog("Export Premiere/CapCut (a brancher XML/EDL).")}>
          Export Premiere/CapCut
        </button>
      </section>

      <section className="panel">
        <h2>Projet</h2>
        <pre>{JSON.stringify(project, null, 2)}</pre>
      </section>

      <footer className="panel log">{log}</footer>
    </main>
  );
}

