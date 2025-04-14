import React, { useState, useEffect } from 'react';
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Wifi,
  AlertTriangle,
  Square
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ref, set, onValue } from 'firebase/database';
import { database } from '@/firebase/firebaseConfig';

const LiveControlPage = () => {
  const [status, setStatus] = useState('');
  const [speed, setSpeed] = useState(128);
  const [motorOn, setMotorOn] = useState(false);
  const [showStatusMessage, setShowStatusMessage] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  const toggleMotor = async () => {
    const newState = !motorOn;
    setMotorOn(newState);
    
    try {
      const motorRef = ref(database, 'esp32_cleaning_bot/triggers');
      await set(motorRef, {
        command: newState ? 'W' : 'w',
        speed: speed,
        timestamp: Date.now()
      });
    } catch (error) {
      setStatus('Error toggling motor');
      console.error(error);
    }
  };

  useEffect(() => {
    if (status) {
      setShowStatusMessage(true);
      const timer = setTimeout(() => {
        setShowStatusMessage(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  useEffect(() => {
    const connectedRef = ref(database, '.info/connected');
    const unsubscribe = onValue(connectedRef, (snapshot) => {
      if (snapshot.val() === true) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('error');
      }
    });
    sendCommand('S');
    return () => unsubscribe();
  }, []);

  const sendCommand = async (command) => {
    let finalSpeed = speed;
    if (command == 'R' || command == 'L') {
      finalSpeed = finalSpeed + 35;
      if (finalSpeed > 255) {
        finalSpeed = 255;
      }
      else if (finalSpeed < 128) {
        finalSpeed = 128;
      }
    }
    try {
      const commandRef = ref(database, 'esp32_cleaning_bot/triggers');
      await set(commandRef, {
        command: command,
        timestamp: Date.now(),
        speed: finalSpeed
      });
    } catch (error) {
      setStatus('Error sending command');
      console.error(error);
    }
  };

  const handleSpeedChange = async (value) => {
    if (connectionStatus !== 'connected') {
      setStatus('Connection error. Please check your connection.');
      return;
    }
    setSpeed(value);
    try {
      const speedRef = ref(database, 'esp32_cleaning_bot/triggers');
      await set(speedRef, {
        command: 'speed',
        speed: value,
        timestamp: Date.now()
      });
    } catch (error) {
      setStatus('Error setting speed');
      console.error(error);
    }
  };

  const DirectionalControls = () => {
    const [activeButton, setActiveButton] = useState(null);
    
    const handleButtonPress = (direction) => {
      setActiveButton(direction);
      sendCommand(direction);
    };
    
    const handleButtonRelease = () => {
      setActiveButton(null);
      sendCommand('S');
    };
    
    const getButtonStyle = (direction) => {
      return activeButton === direction 
        ? "shadow-inner bg-primary-foreground border-primary text-primary transform translate-y-0.5" 
        : "shadow-md hover:shadow-lg border-primary/20";
    };
    
    return (
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs mx-auto">
        {/* Empty space */}
        <div className="col-start-1 row-start-1"></div>
        
        {/* Forward button */}
        <Button
          onPointerDown={() => handleButtonPress('F')}
          onPointerUp={handleButtonRelease}
          onPointerLeave={handleButtonRelease}
          className={`col-start-2 row-start-1 rounded-md flex items-center justify-center h-16 transition-all duration-100 border-2 ${getButtonStyle('F')}`}
          variant="outline"
          aria-label="Forward"
        >
          <ArrowUp size={24} />
        </Button>
        
        {/* Empty space */}
        <div className="col-start-3 row-start-1"></div>
        
        {/* Left button */}
        <Button
          onPointerDown={() => handleButtonPress('L')}
          onPointerUp={handleButtonRelease}
          onPointerLeave={handleButtonRelease}
          className={`col-start-1 row-start-2 rounded-md flex items-center justify-center h-16 transition-all duration-100 border-2 ${getButtonStyle('L')}`}
          variant="outline"
          aria-label="Left"
        >
          <ArrowLeft size={24} />
        </Button>
        
        {/* Center indicator - shows active status */}
        <div className="col-start-2 row-start-2 flex items-center justify-center h-16">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${activeButton ? 'bg-red-500' : 'bg-gray-200'} transition-colors duration-200`}>
            <Square size={16} className="text-white" />
          </div>
        </div>
        
        {/* Right button */}
        <Button
          onPointerDown={() => handleButtonPress('R')}
          onPointerUp={handleButtonRelease}
          onPointerLeave={handleButtonRelease}
          className={`col-start-3 row-start-2 rounded-md flex items-center justify-center h-16 transition-all duration-100 border-2 ${getButtonStyle('R')}`}
          variant="outline"
          aria-label="Right"
        >
          <ArrowRight size={24} />
        </Button>
        
        {/* Empty space */}
        <div className="col-start-1 row-start-3"></div>
        
        {/* Backward button */}
        <Button
          onPointerDown={() => handleButtonPress('B')}
          onPointerUp={handleButtonRelease}
          onPointerLeave={handleButtonRelease}
          className={`col-start-2 row-start-3 rounded-md flex items-center justify-center h-16 transition-all duration-100 border-2 ${getButtonStyle('B')}`}
          variant="outline"
          aria-label="Backward"
        >
          <ArrowDown size={24} />
        </Button>
        
        {/* Empty space */}
        <div className="col-start-3 row-start-3"></div>
      </div>
    );
  };

  const SpeedControl = () => {
    const presets = [
      { name: 'Slow', value: 64 },
      { name: 'Medium', value: 128 },
      { name: 'Fast', value: 192 },
      { name: 'Max', value: 255 }
    ];

    return (
      <div className="space-y-3 w-full mt-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-medium">Speed</h3>
          <Badge variant="secondary" className="font-medium">
            {speed}
          </Badge>
        </div>
        
        <Slider
          value={[speed]}
          onValueChange={(value) => {
            handleSpeedChange(value[0]);
          }}
          max={255}
          step={10}
          className="w-full"
        />
        
        <div className="flex justify-between text-xs text-muted-foreground px-1">
          <span>Min</span>
          <span>Mid</span>
          <span>Max</span>
        </div>
        
        <div className="flex gap-2 mt-2">
          {presets.map((preset) => (
            <Button
              key={preset.name}
              onClick={() => {
                handleSpeedChange(preset.value);
              }}
              variant={speed === preset.value ? "default" : "outline"}
              className="flex-1 h-8"
              size="sm"
            >
              {preset.name}
            </Button>
          ))}
        </div>
      </div>
    );
  };

  const MotorStatus = () => {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Motor Status</h3>
        <div className="flex justify-between items-center">
          <span className="text-md text-muted-foreground">
            {motorOn ? 'Running' : 'Stopped'}
          </span>
          <Button 
            onClick={toggleMotor}
            variant={motorOn ? "default" : "outline"}
            className={`transition-all duration-200 px-4 py-6 text-xl ${motorOn ? "bg-green-600 hover:bg-green-700" : "border-red-200 text-red-700 hover:bg-red-50"}`}
            size="sm"
          >
            {motorOn ? (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-white animate-pulse"></span>
                Turn Off
              </span>
            ) : (
              "Turn On"
            )}
          </Button>
        </div>
      </div>
    );
  };

  const ConnectionIndicator = () => {
    const statusConfig = {
      connected: {
        variant: "outline",
        className: "bg-green-50 text-green-700 border-green-200",
        label: "Connected",
        icon: <Wifi size={16} className="mr-1" />
      },
      disconnected: {
        variant: "outline",
        className: "bg-red-50 text-red-700 border-red-200",
        label: "Disconnected",
        icon: <AlertTriangle size={16} className="mr-1" />
      },
      error: {
        variant: "outline",
        className: "bg-amber-50 text-amber-700 border-amber-200",
        label: "Connection Error",
        icon: <AlertTriangle size={16} className="mr-1" />
      },
      connecting: {
        variant: "outline",
        className: "bg-blue-50 text-blue-700 border-blue-200",
        label: "Connecting...",
        icon: <Wifi size={16} className="mr-1 animate-pulse" />
      }
    };
    
    const config = statusConfig[connectionStatus];
    
    return (
      <Badge 
        variant={config.variant}
        className={config.className}
      >
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="py-2">
      <div className="max-w-7xl mx-auto px-2 py-0 space-y-6">
        <div className="flex justify-end items-center">
          <ConnectionIndicator />
        </div>
        {showStatusMessage && status && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Alert</AlertTitle>
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            {/* <CardHeader>
              <CardTitle>Controls</CardTitle>
            </CardHeader> */}
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-sm font-medium mb-4">Movement</h3>
                <div className="flex justify-center">
                  <DirectionalControls />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-6">
              <SpeedControl />
              <Separator className="my-6" />
              <MotorStatus />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LiveControlPage;