#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}Stopping ACA services...${NC}"
echo ""

# Stop Backend
if [ -f "logs/backend.pid" ]; then
    BACKEND_PID=$(cat logs/backend.pid)
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        kill $BACKEND_PID 2>/dev/null || true
        sleep 1
        # Force kill if still running
        if ps -p $BACKEND_PID > /dev/null 2>&1; then
            kill -9 $BACKEND_PID 2>/dev/null || true
        fi
        echo -e "${GREEN}Backend stopped (PID: $BACKEND_PID)${NC}"
    else
        echo -e "${YELLOW}Backend process not found${NC}"
    fi
    rm -f logs/backend.pid
else
    echo -e "${YELLOW}Backend PID file not found${NC}"
fi

# Stop Runner
if [ -f "logs/runner.pid" ]; then
    RUNNER_PID=$(cat logs/runner.pid)
    if ps -p $RUNNER_PID > /dev/null 2>&1; then
        kill $RUNNER_PID 2>/dev/null || true
        sleep 1
        # Force kill if still running
        if ps -p $RUNNER_PID > /dev/null 2>&1; then
            kill -9 $RUNNER_PID 2>/dev/null || true
        fi
        echo -e "${GREEN}Runner stopped (PID: $RUNNER_PID)${NC}"
    else
        echo -e "${YELLOW}Runner process not found${NC}"
    fi
    rm -f logs/runner.pid
else
    echo -e "${YELLOW}Runner PID file not found${NC}"
fi

# Kill any remaining processes by name
echo ""
echo -e "${CYAN}Killing remaining processes by name...${NC}"
pkill -f "node src/index.js" 2>/dev/null && echo -e "${GREEN}Killed remaining backend processes${NC}" || true
pkill -f "python.*run.py" 2>/dev/null && echo -e "${GREEN}Killed remaining runner processes${NC}" || true

# Kill any remaining processes on ports
echo ""
echo -e "${CYAN}Checking for remaining processes on ports...${NC}"
if command -v lsof > /dev/null 2>&1; then
    PID3000=$(lsof -ti:3000 2>/dev/null)
    if [ ! -z "$PID3000" ]; then
        kill -9 $PID3000 2>/dev/null && echo -e "${GREEN}Cleaned up port 3000 (PID: $PID3000)${NC}" || true
    else
        echo -e "${YELLOW}Port 3000 is free${NC}"
    fi
    
    PID5001=$(lsof -ti:5001 2>/dev/null)
    if [ ! -z "$PID5001" ]; then
        kill -9 $PID5001 2>/dev/null && echo -e "${GREEN}Cleaned up port 5001 (PID: $PID5001)${NC}" || true
    else
        echo -e "${YELLOW}Port 5001 is free${NC}"
    fi
elif command -v fuser > /dev/null 2>&1; then
    fuser -k 3000/tcp 2>/dev/null && echo -e "${GREEN}Cleaned up port 3000${NC}" || echo -e "${YELLOW}Port 3000 is free${NC}"
    fuser -k 5001/tcp 2>/dev/null && echo -e "${GREEN}Cleaned up port 5001${NC}" || echo -e "${YELLOW}Port 5001 is free${NC}"
else
    echo -e "${YELLOW}Cannot check ports (lsof/fuser not available)${NC}"
fi

# Wait a moment for ports to be released
sleep 1

echo ""
echo -e "${GREEN}All services stopped!${NC}"

