# MAV

Socle V1 pour un logiciel de montage simple connecte a `maxvideoai.com`.

## Contenu

- `apps/desktop`: application desktop (React + Vite) pour previsualiser, monter simple, lancer actions IA.
- `apps/api`: API Node/Express qui sert de pont vers `maxvideoai.com`.
- `packages/shared`: types partages (format de projet `.mavproj`).

## Demarrage rapide

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Le front tourne sur `http://localhost:5173` et l'API sur `http://localhost:8787`.

## Variables d'environnement

- `MAXVIDEOAI_BASE_URL`: URL du site/API cible.
- `MAXVIDEOAI_API_KEY`: cle API (si vide et `ALLOW_MOCK=true`, des reponses mock sont renvoyees).
- `ALLOW_MOCK`: active les reponses locales pour developper sans backend distant.
- `VITE_API_URL`: URL API consommee par le desktop.

## Endpoints API (MVP)

- `GET /health`
- `POST /api/ai/subtitles`
- `POST /api/ai/voiceover`
- `POST /api/projects/sync`

## Prochaine etape

1. Connecter les vrais endpoints `maxvideoai.com`.
2. Ajouter generation de `mavproj` depuis la timeline.
3. Ajouter export XML/EDL pour Premiere.

## Licence

Ce depot est sous licence proprietaire ("All rights reserved").  
Voir `/LICENSE`.
