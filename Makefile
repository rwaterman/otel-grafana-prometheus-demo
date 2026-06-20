.PHONY: up down logs ps clean validate

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps

clean:
	docker compose down --volumes --remove-orphans

validate:
	docker compose config --quiet
	node --check app/src/server.js

