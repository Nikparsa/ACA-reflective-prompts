# Run the Project from Docker Images (No Source Code Required)

This guide explains how to run the full stack using only a `.tar` image archive in Docker Engine.

## Prerequisites

- Docker Desktop / Docker Engine is installed and running.
- You received an archive file, for example: `ba-stack-images.tar`.

## 1) Load Docker images from the archive

```powershell
docker load -i "C:\path\to\ba-stack-images.tar"
```

## 2) Verify images are available

```powershell
docker images
```

Expected image tags:

- `ba-frontend:latest`
- `ba-backend:latest`
- `ba-runner:latest`

## 3) Clean up old containers (recommended)

```powershell
docker rm -f ba-frontend ba-backend ba-runner 2>$null
docker network create ba-net 2>$null
```

## 4) Start services

Run in this order:

```powershell
docker run -d --name ba-runner --network ba-net -p 5001:5001 -e PORT=5001 -e BACKEND_URL=http://ba-backend:3000 ba-runner:latest
docker run -d --name ba-backend --network ba-net -p 3000:3000 -e PORT=3000 -e JWT_SECRET=dev_secret_change_me -e RUNNER_URL=http://ba-runner:5001 ba-backend:latest
docker run -d --name ba-frontend --network ba-net -p 5173:80 ba-frontend:latest
```

## 5) Check running status

```powershell
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

You should see all three containers in `Up` status.

## 6) Open the app

Open in browser:

- `http://localhost:5173`

---

## Quick management commands

### Stop all services

```powershell
docker stop ba-frontend ba-backend ba-runner
```

### Start again (without recreate)

```powershell
docker start ba-runner ba-backend ba-frontend
```

### Show recent logs

```powershell
docker logs ba-frontend --tail 50
docker logs ba-backend --tail 50
docker logs ba-runner --tail 50
```

---

## Troubleshooting

### Error: `port is already allocated`

A different container is already using the same port. Stop/remove old containers first:

```powershell
docker ps
docker rm -f <container_name>
```

Then run the `docker run` commands again.

### App not opening on `localhost:5173`

Check:

1. `ba-frontend` is `Up` in `docker ps`
2. Port mapping exists: `0.0.0.0:5173->80/tcp`
3. No firewall/proxy is blocking localhost connections
