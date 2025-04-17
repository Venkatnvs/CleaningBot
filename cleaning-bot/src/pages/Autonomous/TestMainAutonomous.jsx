import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Line, Circle, Text, Rect, Image } from 'react-konva';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play, Trash2, Ruler, Download, Info, Save, FolderOpen, Settings } from 'lucide-react';
import { database } from '@/firebase/firebaseConfig';
import PageContainer from '@/components/layout/PageContainer';
import { toast } from 'sonner';
import { ref, set, get, child } from 'firebase/database';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Constants for ESP32 mapping and UI scale
const BOX_SIZE_CM = 10; // Each grid square is 10cm x 10cm
const PIXEL_TO_CM_RATIO = 5; // 5 pixels = 1cm
const GRID_SIZE = 20;

// ESP32 Firebase paths (must match your ESP32 code)
const ESP32_TRIGGERS_PATH = "esp32_cleaning_bot/triggers";
const ESP32_COMMAND_PATH = `${ESP32_TRIGGERS_PATH}/command`;
const ESP32_SPEED_PATH = `${ESP32_TRIGGERS_PATH}/speed`;

// Routes Firebase path
const ROUTES_PATH = "esp32_cleaning_bot/saved_routes";

// Command execution constants - default values
const DEFAULT_COMMAND_DELAY_MS = 100; // Minimum delay between commands (ms)
const DEFAULT_CM_TO_MS_FACTOR = 150;  // Milliseconds per cm of movement (at full speed)
const DEFAULT_TURN_DURATION_MS = 1000; // Duration for a turn (ms)

// Helper to pause execution for given ms
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const MainAutonomous = () => {
  // Canvas and drawing state
  const [lines, setLines] = useState([]);
  const [points, setPoints] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState(null);
  const [selectedLine, setSelectedLine] = useState(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [mousePosition, setMousePosition] = useState(null);
  const [showScaleInfo, setShowScaleInfo] = useState(false);

  // Bot control state
  const [isBotMoving, setIsBotMoving] = useState(false);
  const isBotMovingRef = useRef(false); // mutable flag used inside the async loop
  const [currentPosition, setCurrentPosition] = useState(null);
  const [routeProgress, setRouteProgress] = useState(0);
  const [routeStats, setRouteStats] = useState({
    totalDistance: 0,
    estimatedTime: 0,
    totalDistanceCM: 0,
  });
  const [botSpeed, setBotSpeed] = useState(128);

  // Command execution settings state
  const [commandDelayMs, setCommandDelayMs] = useState(DEFAULT_COMMAND_DELAY_MS);
  const [cmToMsFactor, setCmToMsFactor] = useState(DEFAULT_CM_TO_MS_FACTOR);
  const [turnDurationMs, setTurnDurationMs] = useState(DEFAULT_TURN_DURATION_MS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Firebase and stage/container refs
  const stageRef = useRef(null);
  const containerRef = useRef(null);

  // Add route saving/loading state
  const [routeName, setRouteName] = useState("default_route");

  // Robot image state
  const [robotImage, setRobotImage] = useState(null);
  const [robotSize, setRobotSize] = useState({ width: 30, height: 30 });
  const [robotRotation, setRobotRotation] = useState(0); // 0 degrees = facing east

  // Determine if we're on a mobile device
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Update isMobile state when window resizes
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    // Debounce the resize handler to prevent multiple rapid calls
    let resizeTimeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(handleResize, 100);
    };
    
    window.addEventListener('resize', debouncedResize);
    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', debouncedResize);
    };
  }, []);

  // Ensure stop command is sent on mount/unmount
  useEffect(() => {
    set(ref(database, ESP32_COMMAND_PATH), "S");
    return () => set(ref(database, ESP32_COMMAND_PATH), "S");
  }, []);

  // Initialize bot position once stage size is set
  useEffect(() => {
    if (!currentPosition && stageSize.width > 0) {
      setCurrentPosition({
        x: stageSize.width / 2,
        y: stageSize.height / 2,
      });
    }
  }, [currentPosition, stageSize]);

  // Responsive stage dimensions
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        const boxSizePixels = BOX_SIZE_CM * PIXEL_TO_CM_RATIO;
        const viewportHeight = window.innerHeight;
        setStageSize({ width, height: isMobile 
          ? Math.min(viewportHeight * 0.7, boxSizePixels * GRID_SIZE)
          : Math.min(viewportHeight * 0.6, boxSizePixels * GRID_SIZE) });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [isMobile]);

  // Calculate route statistics from drawn lines
  useEffect(() => {
    let totalDistance = 0;
    if (lines.length > 0) {
      lines.forEach(line => {
        const [x1, y1, x2, y2] = line.points;
        totalDistance += Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      });
      const distanceCM = totalDistance / PIXEL_TO_CM_RATIO;
      const distanceMeters = distanceCM / 100;
      const numTurns = lines.length;
      const speedFactor = botSpeed / 128;
      const moveTime = (distanceCM * cmToMsFactor / 1000) / speedFactor;
      const turnTime = numTurns * (turnDurationMs / 1000);
      setRouteStats({
        totalDistance: distanceMeters.toFixed(2),
        totalDistanceCM: Math.round(distanceCM),
        estimatedTime: (moveTime + turnTime).toFixed(1),
      });
    } else {
      setRouteStats({ totalDistance: 0, totalDistanceCM: 0, estimatedTime: 0 });
    }
  }, [lines, botSpeed, cmToMsFactor, turnDurationMs]);

  // Load robot image and handle resizing based on screen size
  useEffect(() => {
    const image = new window.Image();
    image.src = '/images/robot-car.png';
    image.onload = () => {
      setRobotImage(image);
      
      // Adjust robot size based on screen width
      const handleResize = () => {
        const width = window.innerWidth;
        if (width < 768) {
          setRobotSize({ width: 25, height: 25 }); // Smaller on mobile
        } else {
          setRobotSize({ width: 30, height: 30 }); // Default size
        }
      };
      
      handleResize(); // Set initial size
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    };
  }, []);

  // --- Drawing Handlers ---
  const handleMouseMove = useCallback((e) => {
    if (isDrawing && stageRef.current) {
      const stage = e.target.getStage();
      const pos = stage.getPointerPosition();
      if (pos && startPoint) {
        // Snap to 90 degrees - determine if horizontal or vertical based on distance
        const dx = Math.abs(pos.x - startPoint.x);
        const dy = Math.abs(pos.y - startPoint.y);
        
        const snappedPos = { ...pos };
        if (dx > dy) {
          // Horizontal line - keep x, use startPoint's y
          snappedPos.y = startPoint.y;
        } else {
          // Vertical line - keep y, use startPoint's x
          snappedPos.x = startPoint.x;
        }
        setMousePosition(snappedPos);
      } else if (pos) {
        setMousePosition(pos);
      }
    }
  }, [isDrawing, startPoint]);

  const handleMouseDown = useCallback((e) => {
    if (!isDrawing) return;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;
    if (!startPoint) {
      // Begin drawing: record the first point
      setStartPoint({ x: pos.x, y: pos.y });
      setPoints((prev) => [...prev, { x: pos.x, y: pos.y }]);
    } else {
      // Calculate snapped position for 90-degree angles
      const dx = Math.abs(pos.x - startPoint.x);
      const dy = Math.abs(pos.y - startPoint.y);
      
      let endPos = { ...pos };
      if (dx > dy) {
        // Horizontal line
        endPos.y = startPoint.y;
      } else {
        // Vertical line
        endPos.x = startPoint.x;
      }
      
      // Create a new line from startPoint to the snapped position
      const newLine = {
        points: [startPoint.x, startPoint.y, endPos.x, endPos.y],
        selected: false,
      };
      setLines((prev) => [...prev, newLine]);
      setStartPoint({ x: endPos.x, y: endPos.y });
      setPoints((prev) => [...prev, { x: endPos.x, y: endPos.y }]);
    }
  }, [isDrawing, startPoint]);

  const handleDoubleClick = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false);
      setStartPoint(null);
      setMousePosition(null);
    }
  }, [isDrawing]);

  const handleLineClick = useCallback((index) => {
    if (isDrawing) return; // do not allow selection while drawing
    const updatedLines = lines.map((line, i) => ({
      ...line,
      selected: i === index ? !line.selected : false,
    }));
    setLines(updatedLines);
    setSelectedLine(updatedLines[index].selected ? index : null);
  }, [lines, isDrawing]);

  const clearCanvas = () => {
    setLines([]);
    setPoints([]);
    setSelectedLine(null);
    setIsDrawing(false);
    setStartPoint(null);
    setMousePosition(null);
  };

  const deleteSelectedLine = () => {
    if (selectedLine !== null) {
      setLines((prev) => prev.filter((_, i) => i !== selectedLine));
      setSelectedLine(null);
    }
  };

  const toggleDrawingMode = () => {
    setIsDrawing((prev) => {
      if (prev) {
        setStartPoint(null);
        setMousePosition(null);
      }
      return !prev;
    });
  };

  // Improve touch handling for mobile devices
  const handleTouchStart = useCallback((e) => {
    e.evt.preventDefault(); // Prevent scrolling while drawing
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    
    if (!isDrawing) return;
    
    if (!pos) return;
    if (!startPoint) {
      // Begin drawing: record the first point
      setStartPoint({ x: pos.x, y: pos.y });
      setPoints((prev) => [...prev, { x: pos.x, y: pos.y }]);
    } else {
      // Calculate snapped position for 90-degree angles
      const dx = Math.abs(pos.x - startPoint.x);
      const dy = Math.abs(pos.y - startPoint.y);
      
      let endPos = { ...pos };
      if (dx > dy) {
        // Horizontal line
        endPos.y = startPoint.y;
      } else {
        // Vertical line
        endPos.x = startPoint.x;
      }
      
      // Create a new line from startPoint to the snapped position
      const newLine = {
        points: [startPoint.x, startPoint.y, endPos.x, endPos.y],
        selected: false,
      };
      setLines((prev) => [...prev, newLine]);
      setStartPoint({ x: endPos.x, y: endPos.y });
      setPoints((prev) => [...prev, { x: endPos.x, y: endPos.y }]);
    }
  }, [isDrawing, startPoint]);

  const handleTouchMove = useCallback((e) => {
    e.evt.preventDefault(); // Prevent scrolling while drawing
    
    if (isDrawing && stageRef.current) {
      const stage = e.target.getStage();
      const pos = stage.getPointerPosition();
      
      if (pos && startPoint) {
        // Snap to 90 degrees - determine if horizontal or vertical based on distance
        const dx = Math.abs(pos.x - startPoint.x);
        const dy = Math.abs(pos.y - startPoint.y);
        
        const snappedPos = { ...pos };
        if (dx > dy) {
          // Horizontal line - keep x, use startPoint's y
          snappedPos.y = startPoint.y;
        } else {
          // Vertical line - keep y, use startPoint's x
          snappedPos.x = startPoint.x;
        }
        setMousePosition(snappedPos);
      } else if (pos) {
        setMousePosition(pos);
      }
    }
  }, [isDrawing, startPoint]);

  const handleTouchEnd = useCallback((e) => {
    // Double tap detection for mobile
    if (isDrawing) {
      const now = new Date().getTime();
      const timeSince = now - (e.target._lastTapTime || 0);
      
      if (timeSince < 300 && timeSince > 0) {
        // This is a double tap
        setIsDrawing(false);
        setStartPoint(null);
        setMousePosition(null);
      }
      
      e.target._lastTapTime = now;
    }
  }, [isDrawing]);

  // --- Route Conversion and Bot Control ---
  // Calculate the duration based on distance (in cm) and bot speed.
  const calculateDuration = (distanceCM) => {
    const speedRatio = botSpeed / 255;
    return Math.max(commandDelayMs, Math.round(distanceCM * cmToMsFactor / speedRatio));
  };

  // Convert drawn lines into an array of instructions for the ESP32.
  const getInstructions = () => {
    if (lines.length === 0) {
      toast("Please draw a route first.");
      return null;
    }
    const instructions = [];
    
    // Determine initial direction based on first line
    let currentDirection;
    
    // Process lines one by one
    lines.forEach((line, lineIndex) => {
      const [x1, y1, x2, y2] = line.points;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const distance = Math.sqrt(dx * dx + dy * dy) / PIXEL_TO_CM_RATIO;
      
      // Determine new direction based on line orientation
      let newDirection;
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal movement
        newDirection = dx > 0 ? 'east' : 'west';
      } else {
        // Vertical movement
        newDirection = dy > 0 ? 'south' : 'north';
      }
      
      // If this is the first line, just set the initial direction without turning
      if (lineIndex === 0) {
        if (newDirection === "east" || newDirection === "west") {
          let turnCommand = newDirection === "east" ? 'R' : 'L';
          instructions.push({
            type: 'turn',
            command: turnCommand,
            duration: turnDurationMs,
            coords: { x1, y1, x2, y2 }
          });
        } else if (newDirection === "south") {
          instructions.push({
            type: 'turn',
            command: 'R',
            duration: turnDurationMs,
            coords: { x1, y1, x2, y2 }
          });
          instructions.push({
            type: 'turn',
            command: 'R',
            duration: turnDurationMs,
            coords: { x1, y1, x2, y2 }
          });
        }
        currentDirection = newDirection;
      } 
      // Only add turn command if direction changes after first line
      else if (currentDirection !== newDirection) {
        // Determine turn direction (clockwise = R, counter-clockwise = L)
        let turnCommand;
        
        // Simple direction mapping for turns
        const directionMap = {
          'east': { 'north': 'L', 'south': 'R', 'west': 'R' },
          'west': { 'north': 'R', 'south': 'L', 'east': 'R' },
          'north': { 'east': 'R', 'west': 'L', 'south': 'R' },
          'south': { 'east': 'L', 'west': 'R', 'north': 'R' }
        };
        
        turnCommand = directionMap[currentDirection][newDirection];
        
        instructions.push({
          type: 'turn',
          command: turnCommand,
          duration: turnDurationMs,
          coords: { x1, y1, x2, y2 }
        });
        
        currentDirection = newDirection;
      }
      
      // Add forward movement command
      instructions.push({
        type: 'move',
        command: 'F',
        distance: Math.round(distance),
        duration: calculateDuration(distance),
        coords: { x1, y1, x2, y2 }
      });
    });
    
    return instructions;
  };

  // Update robot speed in Firebase and locally.
  const updateBotSpeed = (newSpeed) => {
    setBotSpeed(newSpeed);
    set(ref(database, ESP32_SPEED_PATH), newSpeed);
    set(ref(database, ESP32_COMMAND_PATH), "speed");
    toast(`Speed updated to: ${newSpeed}`);
  };

  // Start bot movement by executing instructions sequentially.
  const startBotMovement = async () => {
    const instructions = getInstructions();
    console.log(instructions);
    
    if (!instructions || instructions.length === 0) return;

    if (points.length > 0) {
      setCurrentPosition({ ...points[0] });
      setRobotRotation(0); // Reset rotation to default (facing east)
    }
    setIsBotMoving(true);
    isBotMovingRef.current = true;
    setRouteProgress(0);

    try {
      // Set speed on Firebase and allow a short delay.
      await set(ref(database, ESP32_SPEED_PATH), botSpeed);
      await sleep(500);

      for (let i = 0; i < instructions.length; i++) {
        // Check mutable ref to see if stop was requested
        if (!isBotMovingRef.current) {
          console.log("Movement stopped by user.");
          break;
        }
        const instruction = instructions[i];
        const progress = Math.round(((i + 1) / instructions.length) * 100);

        // Execute the instruction
        await set(ref(database, ESP32_COMMAND_PATH), instruction.command);
        setRouteProgress(progress);
        
        // Handle rotation for turn commands
        if (instruction.type === 'turn') {
          if (instruction.coords) {
            setCurrentPosition({ x: instruction.coords.x1, y: instruction.coords.y1 });
          }
          
          // Update rotation based on turn command
          if (instruction.command === 'R') {
            // Turn right/clockwise: add 90 degrees
            setRobotRotation(prev => (prev + 90) % 360);
          } else if (instruction.command === 'L') {
            // Turn left/counter-clockwise: subtract 90 degrees
            setRobotRotation(prev => (prev - 90 + 360) % 360);
          }
          
          await sleep(instruction.duration);
        }
        // For move commands, animate the position along the path
        else if (instruction.type === 'move' && instruction.coords) {
          const { x1, y1, x2, y2 } = instruction.coords;
          const startPos = { x: x1, y: y1 };
          const endPos = { x: x2, y: y2 };
          const totalSteps = 20; // Number of animation steps
          const stepDuration = instruction.duration / totalSteps;
          
          // Animate movement along the line
          for (let step = 0; step <= totalSteps; step++) {
            if (!isBotMovingRef.current) break;
            
            const progress = step / totalSteps;
            const newX = startPos.x + (endPos.x - startPos.x) * progress;
            const newY = startPos.y + (endPos.y - startPos.y) * progress;
            
            setCurrentPosition({ x: newX, y: newY });
            await sleep(stepDuration);
          }
        } else if (instruction.coords && instruction.coords.x2 && instruction.coords.y2) {
          // setCurrentPosition({ x: instruction.coords.x2, y: instruction.coords.y2 });
          await sleep(instruction.duration);
        } else {
          await sleep(instruction.duration);
        }

        // If more instructions remain, send a stop command before continuing
        if (i < instructions.length - 1) {
          await set(ref(database, ESP32_COMMAND_PATH), "S");
          await sleep(commandDelayMs);
        }
      }
      // Final stop command after completing instructions
      await set(ref(database, ESP32_COMMAND_PATH), "S");
      setRouteProgress(100);
      toast("Route completed successfully!");
    } catch (error) {
      console.error("Error during route execution:", error);
      toast.error("Error executing route: " + error.message);
      await set(ref(database, ESP32_COMMAND_PATH), "S");
    } finally {
      setIsBotMoving(false);
      isBotMovingRef.current = false;
    }
  };

  // Stop bot movement by updating both the state and mutable ref.
  const stopBotMovement = async () => {
    try {
      await set(ref(database, ESP32_COMMAND_PATH), "S");
      setIsBotMoving(false);
      isBotMovingRef.current = false;
      toast("Bot movement stopped");
    } catch (error) {
      console.error("Error stopping movement:", error);
      toast.error("Failed to stop bot: " + error.message);
    }
  };

  // Download route instructions as a JSON file for ESP32.
  const downloadESP32Route = () => {
    const instructions = getInstructions();
    if (!instructions) return;
    const dataStr = JSON.stringify(instructions, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'route_esp32.json');
    linkElement.click();
    toast("Route downloaded for ESP32");
  };

  // Save current route to Firebase
  const saveRouteToFirebase = async () => {
    if (lines.length === 0) {
      toast.error("Cannot save empty route");
      return;
    }
    
    try {
      const routeData = {
        lines,
        points,
        timestamp: Date.now(),
        stats: routeStats
      };
      
      await set(ref(database, `${ROUTES_PATH}/${routeName}`), routeData);
      toast.success(`Route saved as "${routeName}"`);
    } catch (error) {
      console.error("Error saving route:", error);
      toast.error("Failed to save route: " + error.message);
    }
  };
  
  // Load route from Firebase
  const loadRouteFromFirebase = async () => {
    try {
      const routeRef = ref(database);
      const snapshot = await get(child(routeRef, `${ROUTES_PATH}/${routeName}`));
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        setLines(data.lines || []);
        setPoints(data.points || []);
        toast.success(`Route "${routeName}" loaded successfully`);
      } else {
        toast.error(`No route found with name "${routeName}"`);
      }
    } catch (error) {
      console.error("Error loading route:", error);
      toast.error("Failed to load route: " + error.message);
    }
  };

  // Settings dialog for command execution constants
  const SettingsDialog = () => {
    const [localCommandDelay, setLocalCommandDelay] = useState(commandDelayMs);
    const [localCmToMsFactor, setLocalCmToMsFactor] = useState(cmToMsFactor);
    const [localTurnDuration, setLocalTurnDuration] = useState(turnDurationMs);

    // Reset local state when dialog opens
    useEffect(() => {
      if (settingsOpen) {
        setLocalCommandDelay(commandDelayMs);
        setLocalCmToMsFactor(cmToMsFactor);
        setLocalTurnDuration(turnDurationMs);
      }
    }, [settingsOpen, commandDelayMs, cmToMsFactor, turnDurationMs]);

    const handleSaveSettings = () => {
      setCommandDelayMs(parseInt(localCommandDelay));
      setCmToMsFactor(parseInt(localCmToMsFactor));
      setTurnDurationMs(parseInt(localTurnDuration));
      setSettingsOpen(false);
      toast.success("Settings saved successfully");
    };

    const handleResetToDefaults = () => {
      setLocalCommandDelay(DEFAULT_COMMAND_DELAY_MS);
      setLocalCmToMsFactor(DEFAULT_CM_TO_MS_FACTOR);
      setLocalTurnDuration(DEFAULT_TURN_DURATION_MS);
    };

    const handleOpenChange = (open) => {
      // Prevent closing if tapping inside the dialog
      if (!open) {
        // Add a small delay to prevent instant reopening
        setTimeout(() => setSettingsOpen(false), 50);
      } else {
        setSettingsOpen(true);
      }
    };

    return (
      <Dialog open={settingsOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[425px]" onPointerDownOutside={(e) => {
          // Prevent closing on touch inside the dialog content
          if (e.target && e.target.closest('.dialog-content')) {
            e.preventDefault();
          }
        }}>
          <DialogHeader>
            <DialogTitle>Bot Movement Settings</DialogTitle>
            <DialogDescription>
              Adjust timing parameters for robot movement execution
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 dialog-content">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="commandDelay" className="text-right">
                Command Delay (ms)
              </Label>
              <Input
                id="commandDelay"
                type="number"
                value={localCommandDelay}
                onChange={(e) => setLocalCommandDelay(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="cmToMsFactor" className="text-right">
                MS per CM Factor
              </Label>
              <Input
                id="cmToMsFactor"
                type="number"
                value={localCmToMsFactor}
                onChange={(e) => setLocalCmToMsFactor(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="turnDuration" className="text-right">
                Turn Duration (ms)
              </Label>
              <Input
                id="turnDuration"
                type="number"
                value={localTurnDuration}
                onChange={(e) => setLocalTurnDuration(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleResetToDefaults}>
              Reset to Defaults
            </Button>
            <Button onClick={handleSaveSettings}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <PageContainer scrollable>
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base sm:text-lg">
              <span>Autonomous Route Planning</span>
              <div className="flex items-center space-x-2">
                <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
                  <Settings className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowScaleInfo(!showScaleInfo)}>
                  <Info className="h-4 w-4" />
                </Button>
              </div>
            </CardTitle>
            {isDrawing && (
              <div className="text-xs sm:text-sm font-normal text-muted-foreground">
                {isMobile ? 
                  "Tap to place points. Double-tap to finish drawing." :
                  "Click to place points and create straight lines. Double-click to finish drawing."}
              </div>
            )}
            {showScaleInfo && (
              <div className="text-xs sm:text-sm font-normal text-muted-foreground bg-muted p-2 rounded-md mt-2">
                <p><strong>Scale:</strong> Each grid square = {BOX_SIZE_CM}cm × {BOX_SIZE_CM}cm</p>
                <p><strong>Resolution:</strong> {PIXEL_TO_CM_RATIO} pixels = 1cm</p>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div 
                ref={containerRef} 
                className={`border rounded-md overflow-hidden bg-accent/20 ${isDrawing ? 'select-none touch-none' : ''}`}
                style={{ touchAction: isDrawing ? 'none' : 'auto' }}
              >
                <Stage
                  ref={stageRef}
                  width={stageSize.width}
                  height={stageSize.height}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onDblClick={handleDoubleClick}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <Layer>
                    {/* Scale indicator */}
                    <Rect
                      x={10}
                      y={10}
                      width={BOX_SIZE_CM * PIXEL_TO_CM_RATIO}
                      height={BOX_SIZE_CM * PIXEL_TO_CM_RATIO}
                      stroke="#000"
                      strokeWidth={2}
                      dash={[5, 5]}
                    />
                    <Text
                      x={10}
                      y={BOX_SIZE_CM * PIXEL_TO_CM_RATIO + 15}
                      text={`${BOX_SIZE_CM}cm × ${BOX_SIZE_CM}cm`}
                      fontSize={12}
                      fill="#000"
                    />
                    {/* Grid background */}
                    {Array.from({ length: Math.ceil(stageSize.height / (BOX_SIZE_CM * PIXEL_TO_CM_RATIO)) + 1 }).map((_, i) => (
                      <Line
                        key={`h-${i}`}
                        points={[0, i * (BOX_SIZE_CM * PIXEL_TO_CM_RATIO), stageSize.width, i * (BOX_SIZE_CM * PIXEL_TO_CM_RATIO)]}
                        stroke="#ddd"
                        strokeWidth={0.5}
                      />
                    ))}
                    {Array.from({ length: Math.ceil(stageSize.width / (BOX_SIZE_CM * PIXEL_TO_CM_RATIO)) + 1 }).map((_, i) => (
                      <Line
                        key={`v-${i}`}
                        points={[i * (BOX_SIZE_CM * PIXEL_TO_CM_RATIO), 0, i * (BOX_SIZE_CM * PIXEL_TO_CM_RATIO), stageSize.height]}
                        stroke="#ddd"
                        strokeWidth={0.5}
                      />
                    ))}
                    {/* Draw saved lines */}
                    {lines.map((line, i) => (
                      <Line
                        key={i}
                        points={line.points}
                        stroke={line.selected ? "#3b82f6" : "#06b6d4"}
                        strokeWidth={line.selected ? 3 : 2}
                        hitStrokeWidth={isMobile ? 20 : 10} // Wider hit area on mobile
                        lineCap="round"
                        onClick={() => handleLineClick(i)}
                        onTap={() => handleLineClick(i)}
                      />
                    ))}
                    {/* In-progress drawing line */}
                    {isDrawing && startPoint && mousePosition && (
                      <Line
                        points={[startPoint.x, startPoint.y, mousePosition.x, mousePosition.y]}
                        stroke="#06b6d4"
                        strokeWidth={2}
                        lineCap="round"
                        dash={[5, 5]}
                      />
                    )}
                    {/* Draw placed points */}
                    {points.map((point, i) => (
                      <Circle
                        key={i}
                        x={point.x}
                        y={point.y}
                        radius={isMobile ? 8 : 5} // Larger points on mobile
                        fill="#f97316"
                        stroke="#000"
                        strokeWidth={1}
                      />
                    ))}
                    {/* Current bot position */}
                    {currentPosition && robotImage ? (
                      <Image
                        x={currentPosition.x}
                        y={currentPosition.y}
                        image={robotImage}
                        width={robotSize.width}
                        height={robotSize.height}
                        rotation={robotRotation}
                        offsetX={robotSize.width / 2}
                        offsetY={robotSize.height / 2}
                      />
                    ) : currentPosition && (
                      <Circle
                        x={currentPosition.x}
                        y={currentPosition.y}
                        radius={10}
                        fill="#22c55e"
                        stroke="#000"
                        strokeWidth={2}
                      />
                    )}
                  </Layer>
                </Stage>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={clearCanvas}>
                  <Trash2 className="h-4 w-4 mr-1 sm:mr-2" />
                  <span className="text-xs sm:text-sm">Clear</span>
                </Button>
                {selectedLine !== null && (
                  <Button variant="outline" size="sm" onClick={deleteSelectedLine}>
                    <Trash2 className="h-4 w-4 mr-1 sm:mr-2" />
                    <span className="text-xs sm:text-sm">Delete Line</span>
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={toggleDrawingMode}
                  className={isDrawing ? 'bg-primary text-primary-foreground' : ''}
                >
                  <Ruler className="h-4 w-4 mr-1 sm:mr-2" />
                  <span className="text-xs sm:text-sm">{isDrawing ? 'Stop Drawing' : 'Draw'}</span>
                </Button>
                <Button variant="outline" size="sm" onClick={downloadESP32Route} disabled={lines.length === 0}>
                  <Download className="h-4 w-4 mr-1 sm:mr-2" />
                  <span className="text-xs sm:text-sm">Download</span>
                </Button>
                <Button variant="outline" size="sm" onClick={saveRouteToFirebase} disabled={lines.length === 0}>
                  <Save className="h-4 w-4 mr-1 sm:mr-2" />
                  <span className="text-xs sm:text-sm">Save Route</span>
                </Button>
                <Button variant="outline" size="sm" onClick={loadRouteFromFirebase}>
                  <FolderOpen className="h-4 w-4 mr-1 sm:mr-2" />
                  <span className="text-xs sm:text-sm">Load Route</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Route Control</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="totalDistance" className="text-xs sm:text-sm">Distance</Label>
                    <div className="text-xl font-bold">{routeStats.totalDistance} m</div>
                    <div className="text-xs text-muted-foreground">({routeStats.totalDistanceCM} cm)</div>
                  </div>
                  <div>
                    <Label htmlFor="estimatedTime" className="text-xs sm:text-sm">Est. Time</Label>
                    <div className="text-xl font-bold">{routeStats.estimatedTime} sec</div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="botSpeedSlider" className="text-xs sm:text-sm">Robot Speed</Label>
                    <span className="text-xs font-medium">{botSpeed}/255</span>
                  </div>
                  <Input 
                    id="botSpeedSlider"
                    type="range" 
                    min="50" 
                    max="255" 
                    step="5" 
                    value={botSpeed}
                    onChange={(e) => setBotSpeed(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between">
                    <Button variant="outline" size="sm" onClick={() => updateBotSpeed(85)} className="text-xs">
                      Slow
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => updateBotSpeed(170)} className="text-xs">
                      Medium
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => updateBotSpeed(255)} className="text-xs">
                      Fast
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="routeName" className="text-xs sm:text-sm">Route Name</Label>
                  <div className="flex space-x-2">
                    <Input
                      id="routeName"
                      placeholder="Enter route name"
                      value={routeName}
                      onChange={(e) => setRouteName(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs sm:text-sm">Route Progress</Label>
                    <span className="text-xs font-medium">{routeProgress}%</span>
                  </div>
                  <div className="h-4 w-full bg-accent rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-300 ease-in-out"
                      style={{ width: `${routeProgress}%` }}
                    />
                  </div>
                </div>
                <div className="flex gap-4">
                  {!isBotMoving ? (
                    <Button className="flex-1" onClick={startBotMovement} disabled={lines.length === 0}>
                      <Play className="h-4 w-4 mr-2" />
                      Start Route
                    </Button>
                  ) : (
                    <Button className="flex-1" variant="destructive" onClick={stopBotMovement}>
                      Stop Movement
                    </Button>
                  )}
                </div>
                <div className="p-2 border rounded-lg bg-muted/40 text-xs md:text-sm">
                  <p className="font-medium mb-1">Command Execution:</p>
                  <p>1. Turn commands execute first.</p>
                  <p>2. Movements wait for exact distance timing.</p>
                  <p>3. Commands are executed sequentially.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <SettingsDialog />
    </PageContainer>
  );
};

export default MainAutonomous;