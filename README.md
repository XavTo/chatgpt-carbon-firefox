# ChatGPT Carbon Estimator (Firefox)

## Extension

Cette extension Firefox estime l’empreinte carbone de vos requêtes ChatGPT.
Elle intercepte les appels réseau du site `chatgpt.com` ainsi que de l’API OpenAI
et calcule énergie et émissions à partir de facteurs configurables (Options).

### Tester l’extension localement

1. Installez les dépendances (utile si vous souhaitez démarrer le serveur de
   journalisation ou modifier les sources) :

   ```bash
   npm install
   ```

2. Ouvrez Firefox et rendez-vous sur `about:debugging#/runtime/this-firefox`.
3. Cliquez sur **Charger un module complémentaire temporaire…** et sélectionnez
   le fichier `manifest.json` à la racine du dépôt. L’extension est alors chargée
   en mémoire pour cette session.
4. Épinglez l’icône de l’extension si nécessaire puis ouvrez un onglet sur
   `https://chatgpt.com/`. Rechargez la page pour que le script d’arrière-plan
   capte les requêtes réseau.
5. Ouvrez la popup de l’extension ou le panneau latéral ChatGPT. À chaque
   requête envoyée à ChatGPT, l’estimation devrait se mettre à jour. Les valeurs
   restent figées tant qu’aucune réponse n’est envoyée par le site.

Astuce : pour dépanner, ouvrez `about:debugging`, repérez l’extension puis
cliquez sur **Inspecter**. Vous pourrez consulter la console du service worker
(`background.js`) et vérifier que les messages d’estimation sont bien émis.

### Correctifs récents

- Ajout de l’autorisation `tabs` et meilleure détection de l’onglet source pour
  que les estimations s’affichent correctement dans le panneau et la popup.
- Possibilité d’envoyer chaque estimation vers une API (POST JSON) afin de
  persister les données dans une base distante.
- Journalisation détaillée des requêtes (début, en-têtes, erreurs, estimation)
  envoyée vers l’API configurée pour faciliter le dépannage.

## Journalisation vers PostgreSQL

Un mini-serveur Express est fourni dans le dossier `server/`. Il lit la chaîne de
connexion PostgreSQL depuis un fichier `.env` à la racine et expose une route
`POST /estimations` que l’extension peut appeler.

### Installation

```bash
npm install
```

Créez ensuite un fichier `.env` à la racine :

```
DATABASE_URL=postgresql://user:password@host:port/dbname
# Optionnel : PORT pour le serveur Express (défaut : 4000)
```

### Démarrer le serveur

```bash
npm run start:server
```

Au premier lancement, la table `chatgpt_carbon_events` est créée. Chaque appel à
`POST /estimations` ajoute une ligne contenant les métriques calculées.

### Configurer l’extension

Dans la page d’options de l’extension, activez la section « Journalisation » et
indiquez l’URL complète du point d’entrée (par exemple
`http://localhost:4000/estimations`). À chaque interaction, l’extension émettra
des événements structurés (`request:start`, `request:headers`, `request:error`,
`estimation`, etc.) envoyés à cette adresse.

Chaque événement contient un horodatage ISO 8601 (`timestamp`), le type
(`type`) ainsi que les métriques disponibles au moment du déclenchement. Les
événements d’estimation incluent toujours les champs énergétiques et carbone
(`computeWh`, `totalWh`, `kgCO2`, …).

### Endpoints disponibles

- `GET /health` : vérifie l’état du service.
- `POST /estimations` : enregistre une estimation (format JSON).
- `GET /estimations` : renvoie les 100 dernières estimations.
