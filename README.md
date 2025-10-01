# ChatGPT Carbon Estimator (Firefox)

## Extension

Cette extension Firefox estime l’empreinte carbone de vos requêtes ChatGPT.
Elle intercepte les appels réseau du site `chatgpt.com` ainsi que de l’API
OpenAI et calcule énergie et émissions à partir de facteurs configurables
(Options).

### Tester l’extension localement

1. Chargez l’extension temporairement dans Firefox :
   - Ouvrez `about:debugging#/runtime/this-firefox`.
   - Cliquez sur **Charger un module complémentaire temporaire…** et
     sélectionnez le fichier `manifest.json` à la racine du dépôt.
2. Épinglez l’icône si nécessaire puis ouvrez un onglet sur
   `https://chatgpt.com/`. Rechargez la page pour que le service worker
   (`background.js`) capte les requêtes réseau.
3. Ouvrez la popup ou le panneau latéral injecté par l’extension. À chaque
   requête envoyée à ChatGPT, l’estimation devrait se mettre à jour. Les valeurs
   restent figées tant qu’aucune réponse n’est reçue.

Astuce : pour dépanner, ouvrez `about:debugging`, repérez l’extension puis
cliquez sur **Inspecter**. Vous pourrez consulter la console du service worker
et vérifier que les messages d’estimation sont bien émis.

### Journalisation côté extension

Dans la page d’options, activez la section « Journalisation » pour expédier chaque
événement (`request:start`, `request:headers`, `request:error`, `estimation`, …)
vers une API personnalisée. Le champ « URL » doit pointer vers le point d’entrée
HTTP du serveur (par exemple `http://localhost:3000/events`).

## Serveur NestJS (télémétrie + PostgreSQL)

Le dossier `server/` contient une application NestJS avec TypeORM permettant de
recevoir, stocker et restituer les événements envoyés par l’extension.

### Configuration

1. Copiez le fichier d’exemple et ajustez les variables :

   ```bash
   cp server/.env.example server/.env
   ```

   Paramétrez l’accès PostgreSQL (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
   `DB_PASSWORD`). Les tables sont créées automatiquement grâce à
   `synchronize: true`.

2. Installez les dépendances du serveur :

   ```bash
   cd server
   npm install
   ```

### Démarrage

Lancez le serveur en mode développement (rechargement à chaud) :

```bash
npm --prefix server run start:dev
```

ou construisez puis démarrez en production :

```bash
npm --prefix server run build
node server/dist/main.js
```

Par défaut le service écoute sur `http://localhost:3000` et accepte toutes les
origines (ou celles définies dans `CORS_ORIGINS`).

### Endpoints exposés

- `GET /health` : vérifie l’état du service.
- `POST /events` : enregistre un événement. Corps attendu :
  ```json
  {
    "type": "estimation",
    "requestId": "abc-123",
    "payload": {
      "timestamp": "2024-04-24T09:18:00.000Z",
      "durationSec": 2.4,
      "totalWh": 3.1,
      "kgCO2": 0.0012
    }
  }
  ```
- `GET /events/recent?limit=50` : renvoie les derniers événements (limite max 200).
- `GET /events/summary` : fournit un résumé agrégé des événements « estimation »
  (nombre total, moyennes, dernière estimation enregistrée).

### Brancher l’extension

Dans les options de l’extension :

1. Cochez **Activer la journalisation**.
2. Saisissez l’URL `http://<votre-hôte>:3000/events`.

À chaque requête, l’extension calculera l’empreinte carbone locale puis enverra
l’événement structuré au serveur NestJS. Celui-ci persistera les données dans
PostgreSQL et les exposera via les endpoints précédents.
