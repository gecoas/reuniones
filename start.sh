#!/bin/bash
# Gestión del servidor de reuniones
# Uso: ./start.sh [up|down|restart|logs]

ACTION=${1:-up}

case $ACTION in
  up)
    echo "Iniciando servidor de reuniones..."
    docker compose up -d --build
    echo "Servidor disponible en: http://localhost:8080"
    echo "Dominio externo: http://reuniones.gecoas.es"
    ;;
  down)
    echo "Deteniendo servidor..."
    docker compose down
    ;;
  restart)
    echo "Reiniciando servidor..."
    docker compose down && docker compose up -d --build
    ;;
  logs)
    docker compose logs -f
    ;;
  *)
    echo "Uso: $0 [up|down|restart|logs]"
    ;;
esac
