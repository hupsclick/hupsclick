/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Types for SpeechRecognition API to avoid TypeScript errors
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: any) => void) | null;
  onresult: ((event: any) => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition: { new(): SpeechRecognition };
    webkitSpeechRecognition: { new(): SpeechRecognition };
  }
}

type ActiveHologram = 'none' | 'clock' | 'calendar' | 'calculator' | 'timer' | 'alarm' | 'flashlight' | 'memo' | 'spirit-level' | 'dictation' | 'compass' | 'imprint' | 'privacy';
type AppState = 'start' | 'menu' | 'hologram';

const HologramApp = () => {
  const [appState, setAppState] = useState<AppState>('start');
  const [activeHologram, setActiveHologram] =
    useState<ActiveHologram>('none');
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [calendarDate, setCalendarDate] = useState(new Date());
  
  const audioRef = useRef<HTMLAudioElement>(null);

  // --- Calculator State ---
  const [calcState, setCalcState] = useState({
    display: '0',
    memory: null as number | null,
    operator: null as string | null,
    isFreshEntry: true,
  });

  // --- Timer State ---
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [timerFinished, setTimerFinished] = useState(false);
  const [timerMode, setTimerMode] = useState<'stopwatch' | 'countdown'>('stopwatch');

  // --- Alarm State ---
  const [alarmTime, setAlarmTime] = useState<string | null>(null);
  const [isAlarmRinging, setIsAlarmRinging] = useState(false);

  // --- Flashlight State ---
  const [isFlashlightOn, setIsFlashlightOn] = useState(false);
  const [isSosActive, setIsSosActive] = useState(false);
  const [isAudioSosActive, setIsAudioSosActive] = useState(false);
  const [isSosLightVisible, setIsSosLightVisible] = useState(true);
  const sosTimeoutRef = useRef<number[]>([]);
  const sosAudioTimeoutRef = useRef<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // --- Memo State ---
  const [noteContent, setNoteContent] = useState('');

  // --- Dictation State ---
  const [dictationText, setDictationText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [dictationStatus, setDictationStatus] = useState('Bereit');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  
  // --- Sensor State (Spirit Level & Compass) ---
  const [orientation, setOrientation] = useState({ alpha: 0, beta: 0, gamma: 0 });
  const [permissionState, setPermissionState] = useState<'unknown' | 'prompt' | 'granted' | 'denied'>('unknown');
  const [sensorSupportState, setSensorSupportState] = useState<'checking' | 'supported' | 'unsupported'>('checking');
  const sensorCheckTimeoutRef = useRef<number | null>(null);


  // Load note from localStorage on initial render
  useEffect(() => {
    const savedNote = localStorage.getItem('hologram-note');
    if (savedNote) {
      setNoteContent(savedNote);
    }
  }, []);

  // Save note to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('hologram-note', noteContent);
  }, [noteContent]);


  // Main clock and alarm checker
  useEffect(() => {
    const clockInterval = setInterval(() => {
      const now = new Date();
      setCurrentDateTime(now);

      if (alarmTime && !isAlarmRinging) {
        const [hours, minutes] = alarmTime.split(':');
        if (
          now.getHours() === parseInt(hours, 10) &&
          now.getMinutes() === parseInt(minutes, 10) &&
          now.getSeconds() === 0
        ) {
          setIsAlarmRinging(true);
        }
      }
    }, 1000);

    return () => clearInterval(clockInterval);
  }, [alarmTime, isAlarmRinging]);
  
  // Alarm audio effect
  useEffect(() => {
    if (isAlarmRinging) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(e => console.error("Audio play failed:", e));
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [isAlarmRinging]);


  // Reset calendar to current month when it's not active
  useEffect(() => {
    if (activeHologram !== 'calendar') {
      const resetTimer = setTimeout(() => setCalendarDate(new Date()), 500);
      return () => clearTimeout(resetTimer);
    }
  }, [activeHologram]);


  // --- Timer Logic ---
  useEffect(() => {
    let timerInterval: number | undefined = undefined;

    if (isTimerActive) {
      if (timerMode === 'countdown') {
        if (timerSeconds > 0) {
          timerInterval = window.setInterval(() => {
            setTimerSeconds((seconds) => seconds - 1);
          }, 1000);
        } else { // timerSeconds === 0
          setIsTimerActive(false);
          setTimerFinished(true);
        }
      } else { // timerMode === 'stopwatch'
        timerInterval = window.setInterval(() => {
          setTimerSeconds((seconds) => seconds + 1);
        }, 1000);
      }
    }

    return () => clearInterval(timerInterval);
  }, [isTimerActive, timerSeconds, timerMode]);

  // --- Flashlight Logic ---
  const sosPattern = [
      // S (... --- ...)
      { on: true, duration: 200 }, { on: false, duration: 200 }, // .
      { on: true, duration: 200 }, { on: false, duration: 200 }, // .
      { on: true, duration: 200 }, { on: false, duration: 700 }, // . (end of letter)
      // O (---)
      { on: true, duration: 600 }, { on: false, duration: 200 }, // -
      { on: true, duration: 600 }, { on: false, duration: 200 }, // -
      { on: true, duration: 600 }, { on: false, duration: 700 }, // - (end of letter)
      // S (...)
      { on: true, duration: 200 }, { on: false, duration: 200 }, // .
      { on: true, duration: 200 }, { on: false, duration: 200 }, // .
      { on: true, duration: 200 }, { on: false, duration: 2000 },// . (end of word)
  ];

  const clearVisualSosTimeouts = () => {
    sosTimeoutRef.current.forEach(clearTimeout);
    sosTimeoutRef.current = [];
  };

  const clearAudioSosTimeouts = () => {
    sosAudioTimeoutRef.current.forEach(clearTimeout);
    sosAudioTimeoutRef.current = [];
  };

  useEffect(() => {
    // Cleanup flashlight on component unmount or hologram change
    return () => {
      clearVisualSosTimeouts();
      clearAudioSosTimeouts();
      setIsFlashlightOn(false);
      setIsSosActive(false);
      setIsAudioSosActive(false);
    };
  }, []);

  // Visual SOS effect
  useEffect(() => {
    if (!isSosActive) {
      clearVisualSosTimeouts();
      setIsSosLightVisible(true); // Reset to default state
      return;
    }

    let cumulativeDelay = 0;
    
    const schedulePattern = () => {
      clearVisualSosTimeouts();
      const timeouts: number[] = [];
      cumulativeDelay = 0;

      sosPattern.forEach(signal => {
        const timeoutId = window.setTimeout(() => {
          setIsSosLightVisible(signal.on);
        }, cumulativeDelay);
        timeouts.push(timeoutId);
        cumulativeDelay += signal.duration;
      });

      const loopTimeout = window.setTimeout(schedulePattern, cumulativeDelay);
      timeouts.push(loopTimeout);
      sosTimeoutRef.current = timeouts;
    };
    
    schedulePattern();

    return clearVisualSosTimeouts;
  }, [isSosActive]);

  // Audio SOS effect
  useEffect(() => {
    if (!isAudioSosActive || !audioContextRef.current) {
        clearAudioSosTimeouts();
        return;
    }

    const audioCtx = audioContextRef.current;
    
    const playTone = (duration: number) => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(660, audioCtx.currentTime); // A5 note
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + duration / 1000);
    };
    
    let cumulativeDelay = 0;

    const schedulePattern = () => {
      clearAudioSosTimeouts();
      const timeouts: number[] = [];
      cumulativeDelay = 0;

      sosPattern.forEach(signal => {
        if (signal.on) {
            const timeoutId = window.setTimeout(() => {
                playTone(signal.duration);
            }, cumulativeDelay);
            timeouts.push(timeoutId);
        }
        cumulativeDelay += signal.duration;
      });

      const loopTimeout = window.setTimeout(schedulePattern, cumulativeDelay);
      timeouts.push(loopTimeout);
      sosAudioTimeoutRef.current = timeouts;
    };

    schedulePattern();

    return clearAudioSosTimeouts;
  }, [isAudioSosActive]);
  
  // --- Sensor Logic (Spirit Level & Compass) ---
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      setOrientation({
        alpha: event.alpha ?? 0,
        beta: event.beta ?? 0,
        gamma: event.gamma ?? 0,
      });
    };

    if (activeHologram === 'spirit-level' || activeHologram === 'compass') {
      // 1. Check for sensor support
      if (sensorSupportState === 'checking') {
        const listener = (event: DeviceOrientationEvent) => {
          if (sensorCheckTimeoutRef.current) {
            clearTimeout(sensorCheckTimeoutRef.current);
            sensorCheckTimeoutRef.current = null;
          }
          // Check if we got actual data, which indicates a working sensor
          if (event.beta !== null || event.gamma !== null || event.alpha !== null) {
            setSensorSupportState('supported');
          } else {
            setSensorSupportState('unsupported');
          }
          window.removeEventListener('deviceorientation', listener);
        };

        window.addEventListener('deviceorientation', listener);

        sensorCheckTimeoutRef.current = window.setTimeout(() => {
          setSensorSupportState('unsupported');
          window.removeEventListener('deviceorientation', listener);
        }, 1000); // Wait 1 second for a sensor event
      }
      
      // 2. If supported, handle permissions and listen for data
      if (sensorSupportState === 'supported') {
        // @ts-ignore
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            if (permissionState === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation);
            } else if (permissionState === 'unknown') {
                setPermissionState('prompt');
            }
        } else {
            // For other devices, permission is not needed or granted by default
            setPermissionState('granted');
            window.addEventListener('deviceorientation', handleOrientation);
        }
      }
    }

    return () => {
      // Cleanup: remove the primary listener
      window.removeEventListener('deviceorientation', handleOrientation);
      // Cleanup: clear any pending timeout
      if (sensorCheckTimeoutRef.current) {
        clearTimeout(sensorCheckTimeoutRef.current);
      }
    };
  }, [activeHologram, sensorSupportState, permissionState]);

  // --- Speech Recognition Logic ---
  useEffect(() => {
    if (activeHologram !== 'dictation') {
        if (recognitionRef.current && isRecording) {
            recognitionRef.current.stop();
        }
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        setDictationStatus('Spracherkennung nicht unterstützt');
        return;
    }

    if (!recognitionRef.current) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'de-DE';

        recognition.onstart = () => {
            setIsRecording(true);
            setDictationStatus('Höre zu...');
        };

        recognition.onend = () => {
            setIsRecording(false);
            setDictationStatus('Bereit');
        };

        recognition.onerror = (event: any) => {
            if (event.error === 'no-speech' || event.error === 'audio-capture' || event.error === 'not-allowed') {
                setIsRecording(false);
            }
            setDictationStatus(`Fehler: ${event.error}`);
        };

        recognition.onresult = (event: any) => {
            const transcript = Array.from(event.results)
                .map((result: any) => result[0])
                .map((result: any) => result.transcript)
                .join('');
            setDictationText(transcript);
        };
        recognitionRef.current = recognition;
    }

    // Cleanup on hologram change
    return () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
    };
  }, [activeHologram]);


  const handleStartClick = () => {
    // Pre-load audio on first user interaction to satisfy autoplay policies
    if (audioRef.current) {
      audioRef.current.load();
    }
    setAppState('menu');
  };

  const handleBackClick = () => {
    if (appState === 'hologram') {
      // General cleanup for any active hologram
      if (activeHologram === 'timer') {
        setIsTimerActive(false); 
        setTimerFinished(false);
      }
      if (activeHologram === 'alarm' && isAlarmRinging) {
        setIsAlarmRinging(false); 
      }
      if (activeHologram === 'flashlight') {
        setIsFlashlightOn(false);
        setIsSosActive(false);
        setIsAudioSosActive(false);
        clearVisualSosTimeouts();
        clearAudioSosTimeouts();
      }
      if (activeHologram === 'spirit-level' || activeHologram === 'compass') {
        // Reset permission and support state when leaving
        setPermissionState('unknown');
        setSensorSupportState('checking');
      }
      if (activeHologram === 'dictation') {
          if (recognitionRef.current) {
              recognitionRef.current.stop();
          }
          setIsRecording(false);
      }
      setActiveHologram('none');
      setAppState('menu');
    } else if (appState === 'menu') {
      setAppState('start');
    }
  };

  const handleHologramSelect = (hologramType: ActiveHologram) => {
    setActiveHologram(hologramType);
    setAppState('hologram');
  };
  
  // --- Calculator Logic ---
  const performCalculation = (a: number, b: number, op: string): number => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return a / b;
      default: return b;
    }
  };
  
  const handleCalcInput = (input: string) => {
    if (/\d/.test(input)) {
      const { display, isFreshEntry } = calcState;
      if (isFreshEntry) {
        setCalcState({ ...calcState, display: input, isFreshEntry: false });
      } else {
        setCalcState({ ...calcState, display: display === '0' ? input : display + input });
      }
      return;
    }
    if (input === '.') {
        if (calcState.isFreshEntry) {
            setCalcState({ ...calcState, display: '0.', isFreshEntry: false });
        } else if (!calcState.display.includes('.')) {
            setCalcState({ ...calcState, display: calcState.display + '.' });
        }
        return;
    }
    if (['+', '-', '*', '/'].includes(input)) {
        const { display, memory, operator } = calcState;
        const currentValue = parseFloat(display);

        if (operator && memory !== null && !calcState.isFreshEntry) {
            const result = performCalculation(memory, currentValue, operator);
            setCalcState({ display: String(result), memory: result, operator: input, isFreshEntry: true });
        } else {
            setCalcState({ ...calcState, memory: currentValue, operator: input, isFreshEntry: true });
        }
        return;
    }
    if (input === '=') {
        const { display, memory, operator } = calcState;
        if (!operator || memory === null) return;
        
        const currentValue = parseFloat(display);
        const result = performCalculation(memory, currentValue, operator);
        setCalcState({ display: String(result), memory: null, operator: null, isFreshEntry: true });
        return;
    }
    if (input === 'C') {
        setCalcState({ display: '0', memory: null, operator: null, isFreshEntry: true });
        return;
    }
    if (input === '±') {
        setCalcState({...calcState, display: String(parseFloat(calcState.display) * -1) });
        return;
    }
    if (input === '%') {
        setCalcState({...calcState, display: String(parseFloat(calcState.display) / 100), isFreshEntry: true });
        return;
    }
    if (input === '√') {
        setCalcState({...calcState, display: String(Math.sqrt(parseFloat(calcState.display))), isFreshEntry: true });
        return;
    }
  };

  // --- Timer Controls ---
  const handleStartStop = () => {
    setTimerFinished(false);
    if (timerSeconds === 0 && !isTimerActive) {
      setTimerMode('stopwatch');
    }
    setIsTimerActive(!isTimerActive);
  };

  const handleReset = () => {
    setIsTimerActive(false);
    setTimerSeconds(0);
    setTimerFinished(false);
    setTimerMode('stopwatch');
  };

  const handleSetPreset = (minutes: number) => {
    setTimerMode('countdown');
    setTimerSeconds(minutes * 60);
    setIsTimerActive(true);
    setTimerFinished(false);
  };
  
  // --- Calendar Controls ---
  const handlePrevMonth = () => {
    setCalendarDate(current => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  };
  
  const handleNextMonth = () => {
    setCalendarDate(current => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  };

  // --- Alarm Controls ---
  const handleSetAlarm = () => {
    const timeInput = document.getElementById('alarm-time-input') as HTMLInputElement;
    if (timeInput && timeInput.value) {
      setAlarmTime(timeInput.value);
      setIsAlarmRinging(false);
    }
  };

  const handleClearAlarm = () => {
    setAlarmTime(null);
    setIsAlarmRinging(false);
  };

  const handleStopRinging = () => {
    setIsAlarmRinging(false);
  };

  // --- Flashlight Controls ---
  const initializeAudioContext = () => {
    if (!audioContextRef.current) {
        // @ts-ignore
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            audioContextRef.current = new AudioContext();
        }
    }
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
    }
  };

  const handlePowerOn = () => {
    setIsFlashlightOn(true);
  };
  
  const handleSosVisual = () => {
    setIsFlashlightOn(true);
    setIsSosActive(true);
  };
  
  const handleSosAudio = () => {
    initializeAudioContext();
    setIsFlashlightOn(true);
    setIsSosActive(true);
    setIsAudioSosActive(true);
  };

  // --- Memo Controls ---
  const handleClearNote = () => {
    setNoteContent('');
  };

  const handlePrintNote = () => {
    document.body.classList.add('printing-memo');
    const onAfterPrint = () => {
        document.body.classList.remove('printing-memo');
        window.removeEventListener('afterprint', onAfterPrint);
    }
    window.addEventListener('afterprint', onAfterPrint);
    window.print();
  };

  // --- Dictation Controls ---
  const handleToggleRecording = () => {
    if (!recognitionRef.current) return;
    if (isRecording) {
        recognitionRef.current.stop();
    } else {
        setDictationText(''); // Clear previous text
        recognitionRef.current.start();
    }
  };

  const handleClearDictation = () => {
    setDictationText('');
  };

  const handlePrintDictation = () => {
    document.body.classList.add('printing-dictation');
    const onAfterPrint = () => {
        document.body.classList.remove('printing-dictation');
        window.removeEventListener('afterprint', onAfterPrint);
    }
    window.addEventListener('afterprint', onAfterPrint);
    window.print();
  };
  
  // --- Sensor Controls ---
  const handlePermissionRequest = async () => {
    // @ts-ignore
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        // @ts-ignore
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission === 'granted') {
          setPermissionState('granted');
        } else {
          setPermissionState('denied');
        }
      } catch (error) {
        console.error('Permission request error:', error);
        setPermissionState('denied');
      }
    }
  };


  // --- Formatters ---
  const formatTime = (date: Date) => date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const formatDate = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('de-DE', options);
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };
  
  const getCardinalDirection = (alpha: number): string => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    // Add 22.5 to center the slices, then calculate index
    const index = Math.floor(((alpha + 22.5) % 360) / 45);
    return directions[index];
  };

  // --- Render Functions ---
  const renderCalendar = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    
    const todayReference = new Date();
    const todayDate = todayReference.getDate();
    const isCurrentMonthView = calendarDate.getFullYear() === todayReference.getFullYear() &&
                             calendarDate.getMonth() === todayReference.getMonth();

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const dayOffset = (firstDayOfMonth + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

    const days = [];
    for (let i = 0; i < dayOffset; i++) {
        days.push(<div key={`empty-start-${i}`} className="calendar-day empty"></div>);
    }
    for (let i = 1; i <= daysInMonth; i++) {
        const isToday = isCurrentMonthView && i === todayDate;
        days.push(<div key={`day-${i}`} className={`calendar-day ${isToday ? 'today' : ''}`}>{i}</div>);
    }

    return (
        <div className="calendar-hologram">
            <div className="calendar-header">
                <button onClick={handlePrevMonth} className="calendar-nav-button" aria-label="Vorheriger Monat">‹</button>
                <span>{calendarDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</span>
                <button onClick={handleNextMonth} className="calendar-nav-button" aria-label="Nächster Monat">›</button>
            </div>
            {dayNames.map(name => <div key={name} className="calendar-day-name">{name}</div>)}
            {days}
        </div>
    );
  };

  const renderCalculator = () => {
    const buttons = [
      'C', '√', '%', '/',
      '7', '8', '9', '*',
      '4', '5', '6', '-',
      '1', '2', '3', '+',
      '0', '.', '±', '='
    ];

    const getButtonClass = (btn: string) => {
        if (['/','*','-','+'].includes(btn)) return 'operator-main';
        if (['C','√','%','±'].includes(btn)) return 'operator-func';
        if (btn === '=') return 'equals';
        if (btn === '0') return 'zero';
        return '';
    };

    return (
        <div className="calculator-hologram">
            <div className="calculator-display">{calcState.display}</div>
            {buttons.map(btn => (
                <button key={btn} className={`calculator-button ${getButtonClass(btn)}`} onClick={() => handleCalcInput(btn)}>
                    {btn}
                </button>
            ))}
        </div>
    );
  };

  const renderTimer = () => (
    <div className="timer-hologram">
      <div className="timer-display">{formatTimer(timerSeconds)}</div>
      <div className="main-timer-controls">
        <button onClick={handleStartStop} disabled={timerFinished && timerSeconds === 0}>
          {isTimerActive ? 'Stop' : 'Start'}
        </button>
        <button onClick={handleReset}>Reset</button>
      </div>
      <div className="preset-buttons">
        <span>Countdown:</span>
        <button onClick={() => handleSetPreset(1)} disabled={isTimerActive || (timerFinished && timerSeconds === 0)}>1 Min</button>
        <button onClick={() => handleSetPreset(5)} disabled={isTimerActive || (timerFinished && timerSeconds === 0)}>5 Min</button>
        <button onClick={() => handleSetPreset(10)} disabled={isTimerActive || (timerFinished && timerSeconds === 0)}>10 Min</button>
      </div>
    </div>
  );

  const renderAlarm = () => (
    <div className="alarm-hologram">
      <div className="alarm-status">
        {isAlarmRinging
          ? "Wecker!"
          : alarmTime
          ? `Wecker gestellt für ${alarmTime}`
          : "Kein Wecker gestellt"}
      </div>
      <div className="alarm-controls">
        <input type="time" id="alarm-time-input" className="alarm-time-input" disabled={isAlarmRinging} />
        <button onClick={handleSetAlarm} disabled={isAlarmRinging}>Stellen</button>
      </div>
      <div className="alarm-actions">
        {isAlarmRinging ? (
          <button onClick={handleStopRinging} className="stop-button">Stop</button>
        ) : (
          <button onClick={handleClearAlarm} disabled={!alarmTime}>Löschen</button>
        )}
      </div>
    </div>
  );

  const renderFlashlight = () => {
    // If the flashlight is on in any mode, don't render the control panel.
    // The user must use the "back" button to exit.
    if (isFlashlightOn) {
      return null;
    }

    return (
      <div className="flashlight-hologram">
        <div className="flashlight-status">
          Taschenlampe ist AUS
        </div>
        <div className="flashlight-main-action">
          <button 
            className="flashlight-toggle-button" 
            onClick={handlePowerOn}
            aria-label="Taschenlampe einschalten"
          >
            <div className="power-icon"></div>
          </button>
        </div>
        <div className="flashlight-sos-actions">
          <button className="sos-button" onClick={handleSosVisual}>
            SOS
          </button>
          <button className="sos-button audio" onClick={handleSosAudio}>
            SOS 🔊
          </button>
        </div>
      </div>
    );
  };
  
  const renderMemo = () => (
    <div className="memo-hologram">
        <textarea
            className="memo-textarea"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="Notiz hier eingeben..."
            aria-label="Notizfeld"
        />
        <div className="memo-actions">
            <button className="memo-button" onClick={handleClearNote}>Löschen</button>
            <button className="memo-button" onClick={handlePrintNote}>Drucken</button>
        </div>
    </div>
  );

  const renderDictation = () => (
    <div className="dictation-hologram">
      <div className="dictation-controls">
        <button 
          className={`dictation-record-button ${isRecording ? 'is-recording' : ''}`}
          onClick={handleToggleRecording}
          aria-label={isRecording ? 'Aufnahme stoppen' : 'Aufnahme starten'}
        >
          <div className="dictation-icon-large"></div>
        </button>
        <div className="dictation-status">{dictationStatus}</div>
      </div>
      <textarea
          className="dictation-textarea"
          value={dictationText}
          readOnly
          placeholder="Der transkribierte Text erscheint hier..."
          aria-label="Diktierfeld"
      />
      <div className="dictation-actions">
          <button className="dictation-button" onClick={handleClearDictation}>Löschen</button>
          <button className="dictation-button" onClick={handlePrintDictation}>Drucken</button>
      </div>
    </div>
  );
  
  const renderSensorPermissionUI = () => (
    <>
      {sensorSupportState === 'checking' && (
        <div className="spirit-level-status">
          <p>Suche nach Bewegungssensoren...</p>
          <div className="spinner"></div>
        </div>
      )}
      {sensorSupportState === 'unsupported' && (
        <div className="spirit-level-status">
          <p>Bewegungssensoren nicht gefunden.</p>
          <p>Diese Funktion ist auf diesem Gerät nicht verfügbar.</p>
        </div>
      )}
      {sensorSupportState === 'supported' && permissionState === 'prompt' && (
        <div className="spirit-level-permission">
          <p>Zugriff auf Bewegungssensoren erforderlich.</p>
          <button onClick={handlePermissionRequest} className="permission-button">Sensoren aktivieren</button>
        </div>
      )}
      {sensorSupportState === 'supported' && permissionState === 'denied' && (
        <div className="spirit-level-permission">
          <p>Zugriff verweigert. Bitte in den Browsereinstellungen prüfen.</p>
        </div>
      )}
    </>
  );

  const renderSpiritLevel = () => {
    if (permissionState !== 'granted' || sensorSupportState !== 'supported') {
      return renderSensorPermissionUI();
    }
    
    // Clamp values for visual representation
    const gamma = Math.max(-90, Math.min(90, orientation.gamma));
    const beta = Math.max(-90, Math.min(90, orientation.beta));

    // Map gamma/beta to pixel translation
    const bullseyeX = (gamma / 90) * 45; // Max 45px displacement
    const bullseyeY = (beta / 90) * 45;
    
    const tubeX = (gamma / 90) * 110; // Max 110px displacement
    
    const isLevel = Math.abs(gamma) < 1 && Math.abs(beta) < 1;

    return (
      <div className="spirit-level-hologram">
        <div className="angle-display">
          Neigung: {gamma.toFixed(1)}°
        </div>
        <div className={`tube-level ${isLevel ? 'is-level' : ''}`}>
           <div className="tube-bubble" style={{ transform: `translateX(${tubeX}px)` }}></div>
        </div>
        <div className={`bullseye-level ${isLevel ? 'is-level' : ''}`}>
          <div className="bullseye-bubble" style={{ transform: `translate(${bullseyeX}px, ${bullseyeY}px)` }}></div>
        </div>
      </div>
    );
  };
  
  const renderCompass = () => {
    if (permissionState !== 'granted' || sensorSupportState !== 'supported') {
      return renderSensorPermissionUI();
    }

    const heading = Math.round(orientation.alpha);
    return (
        <div className="compass-hologram">
            <div className="compass-display">
                <span className="compass-degrees">{heading}°</span>
                <span className="compass-cardinal">{getCardinalDirection(heading)}</span>
            </div>
            <div className="compass-rose-container">
                <div className="compass-rose" style={{ transform: `rotate(${-heading}deg)` }}>
                    <div className="compass-marker north">N</div>
                    <div className="compass-marker east">O</div>
                    <div className="compass-marker south">S</div>
                    <div className="compass-marker west">W</div>
                </div>
                <div className="compass-needle"></div>
            </div>
        </div>
    );
  };

  const renderImprint = () => (
    <div className="legal-hologram imprint-hologram">
        <h2>Impressum</h2>
        <p>Angaben gemäß § 5 TMG</p>
        <p>
            Max Mustermann<br />
            Musterstraße 1<br />
            12345 Musterstadt
        </p>
        <h3>Kontakt:</h3>
        <p>
            Telefon: +49 (0) 123 4567890<br />
            E-Mail: kontakt@hupsclick.app
        </p>
        <h3>Haftungsausschluss:</h3>
        <p><strong>Haftung für Inhalte</strong></p>
        <p>Die Inhalte unserer Seiten wurden mit größter Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen. Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich.</p>
        <p><strong>Haftung für Links</strong></p>
        <p>Unser Angebot enthält Links zu externen Webseiten Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.</p>
    </div>
  );

  const renderPrivacy = () => (
    <div className="legal-hologram privacy-hologram">
        <h2>Datenschutzerklärung</h2>

        <h3>Allgemeiner Hinweis</h3>
        <p>Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren personenbezogenen Daten passiert, wenn Sie diese App nutzen. Personenbezogene Daten sind alle Daten, mit denen Sie persönlich identifiziert werden können.</p>

        <h3>Verantwortliche Stelle</h3>
        <p>Die verantwortliche Stelle für die Datenverarbeitung in dieser App ist:</p>
        <p>
            Max Mustermann<br />
            Musterstraße 1<br />
            12345 Musterstadt<br />
            E-Mail: kontakt@hupsclick.app
        </p>

        <h3>Datenerfassung in dieser App</h3>
        <h5>Lokale Speicherung (Local Storage)</h5>
        <p>Wenn Sie die Notizfunktion ("Notiz") verwenden, wird der Inhalt Ihrer Notiz direkt in Ihrem Browser im sogenannten "Local Storage" gespeichert. Diese Daten verbleiben auf Ihrem Gerät und werden nicht an uns oder Dritte übertragen. Die Speicherung dient ausschließlich dem Zweck, Ihre Notiz für zukünftige Besuche zu erhalten. Sie können die Notiz jederzeit innerhalb der App löschen, wodurch sie auch aus dem Local Storage entfernt wird.</p>

        <h5>Mikrofonzugriff (Diktieren)</h5>
        <p>Die Funktion "Diktieren" benötigt Zugriff auf das Mikrofon Ihres Gerätes. Wenn Sie die Aufnahme starten, bittet der Browser um Ihre Erlaubnis. Die aufgenommenen Audiodaten werden vom Browser an einen systemeigenen oder cloud-basierten Spracherkennungsdienst gesendet, um sie in Text umzuwandeln. Die App selbst speichert die Audioaufnahme nicht und der transkribierte Text wird nur temporär für die Anzeige, das Löschen oder Drucken innerhalb der App-Sitzung vorgehalten.</p>

        <h5>Einbindung von Google Fonts</h5>
        <p>Diese Seite nutzt zur einheitlichen Darstellung von Schriftarten so genannte Web Fonts, die von Google bereitgestellt werden. Beim Aufruf einer Seite lädt Ihr Browser die benötigten Web Fonts in ihren Browsercache, um Texte und Schriftarten korrekt anzuzeigen. Zu diesem Zweck muss der von Ihnen verwendete Browser Verbindung zu den Servern von Google aufnehmen. Hierdurch erlangt Google Kenntnis darüber, dass über Ihre IP-Adresse unsere Website aufgerufen wurde. Die Nutzung von Google Web Fonts erfolgt im Interesse einer einheitlichen und ansprechenden Darstellung unserer Online-Angebote. Dies stellt ein berechtigtes Interesse im Sinne von Art. 6 Abs. 1 lit. f DSGVO dar.</p>
        
        <h5>Einbindung von esm.sh</h5>
        <p>Wir verwenden den Dienst esm.sh, um Software-Bibliotheken (React) bereitzustellen, die für die Funktionalität der App notwendig sind. Wenn Sie die App starten, stellt Ihr Browser eine Verbindung zu den Servern von esm.sh her, um diese Bibliotheken zu laden. Dabei wird Ihre IP-Adresse an esm.sh übermittelt. Dies ist technisch erforderlich und dient der Funktionsfähigkeit der Anwendung.</p>

        <h5>Gerätesensoren (Wasserwaage & Kompass)</h5>
        <p>Die Funktionen "Waage" und "Kompass" benötigen Zugriff auf die Bewegungssensoren (Beschleunigungsmesser/Gyroskop) Ihres Gerätes. Sofern Ihr Gerät dies unterstützt und Sie die Funktion nutzen, werden Sie vom Browser um Erlaubnis gebeten. Die Sensordaten werden ausschließlich lokal auf Ihrem Gerät verarbeitet, um die Neigung bzw. Himmelsrichtung anzuzeigen. Es erfolgt keine Speicherung oder Übertragung dieser Daten.</p>

        <h3>Ihre Rechte</h3>
        <p>Sie haben im Rahmen der geltenden gesetzlichen Bestimmungen jederzeit das Recht auf unentgeltliche Auskunft über Ihre gespeicherten personenbezogenen Daten, deren Herkunft und Empfänger und den Zweck der Datenverarbeitung und ggf. ein Recht auf Berichtigung, Sperrung oder Löschung dieser Daten.</p>
    </div>
  );

  const renderHologram = (type: ActiveHologram) => {
    let content: JSX.Element | null = null;
    let wrapperClass = '';

    switch (type) {
      case 'clock':
        wrapperClass = 'clock-wrapper';
        content = (
          <>
            <div className="time">{formatTime(currentDateTime)}</div>
            <div className="date">{formatDate(currentDateTime)}</div>
          </>
        );
        break;
      case 'calendar':
        wrapperClass = 'calendar-wrapper';
        content = renderCalendar();
        break;
      case 'calculator':
        wrapperClass = 'calculator-wrapper';
        content = renderCalculator();
        break;
      case 'timer':
        wrapperClass = 'timer-wrapper';
        if (timerFinished) {
          wrapperClass += ' is-flashing';
        }
        content = renderTimer();
        break;
      case 'alarm':
        wrapperClass = 'alarm-wrapper';
        if (isAlarmRinging) {
            wrapperClass += ' is-flashing';
        }
        content = renderAlarm();
        break;
      case 'flashlight':
        wrapperClass = 'flashlight-wrapper';
        content = renderFlashlight();
        break;
       case 'memo':
        wrapperClass = 'memo-wrapper';
        content = renderMemo();
        break;
      case 'dictation':
        wrapperClass = 'dictation-wrapper';
        content = renderDictation();
        break;
      case 'spirit-level':
        wrapperClass = 'spirit-level-wrapper';
        content = renderSpiritLevel();
        break;
      case 'compass':
        wrapperClass = 'compass-wrapper';
        content = renderCompass();
        break;
      case 'imprint':
        wrapperClass = 'legal-wrapper';
        content = renderImprint();
        break;
      case 'privacy':
        wrapperClass = 'legal-wrapper';
        content = renderPrivacy();
        break;
      default:
        return null;
    }
    
    // Don't render anything if content is null (e.g., flashlight is on)
    if (!content) {
      return null;
    }

    return (
      <div className={`hologram-wrapper ${wrapperClass}`}>
        <div className="hologram-base"></div>
        <div className="hologram-cone"></div>
        <div className="hologram-content">{content}</div>
      </div>
    );
  };
  
  return (
    <>
       {isFlashlightOn && (
        <div
          className={`flashlight-overlay ${isSosActive && !isSosLightVisible ? 'sos-off' : ''}`}
        />
      )}
       <div id="printable-memo-area">
         <pre>{noteContent}</pre>
       </div>
       <div id="printable-dictation-area">
         <pre>{dictationText}</pre>
       </div>
      <div className={`container state-${appState}`}>
        <audio ref={audioRef} loop src="wecker.mp3"></audio>

        {(appState === 'menu' || appState === 'hologram') && (
          <button onClick={handleBackClick} className="back-button" aria-label="Zurück">
            ‹
          </button>
        )}

        {appState === 'start' && (
           <div
            className="start-button-wrapper"
            onClick={handleStartClick}
            role={'button'}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleStartClick();
              }
            }}
            aria-label={'Anwendung starten'}
          >
            <img src="icon-512.png" alt="Hupsclick Start" className="start-icon" />
          </div>
        )}

        <div className="button-container">
          <button className="magic-button" onClick={() => handleHologramSelect('clock')} aria-label="Uhr">
              <div className="magic-button-icon clock-icon"></div>
              <span>Uhr</span>
          </button>
          <button className="magic-button" onClick={() => handleHologramSelect('timer')} aria-label="Timer">
              <div className="magic-button-icon timer-icon"></div>
              <span>Timer</span>
          </button>
           <button className="magic-button" onClick={() => handleHologramSelect('alarm')} aria-label="Wecker">
              <div className="magic-button-icon alarm-icon"></div>
              <span>Wecker</span>
          </button>
          <button className="magic-button" onClick={() => handleHologramSelect('calendar')} aria-label="Kalender">
              <div className="magic-button-icon calendar-icon"></div>
              <span>Kalender</span>
          </button>
          <button className="magic-button" onClick={() => handleHologramSelect('memo')} aria-label="Notiz">
              <div className="magic-button-icon memo-icon"></div>
              <span>Notiz</span>
          </button>
          <button className="magic-button" onClick={() => handleHologramSelect('dictation')} aria-label="Diktiergerät">
              <div className="magic-button-icon dictation-icon"></div>
              <span>Diktieren</span>
          </button>
          <button className="magic-button" onClick={() => handleHologramSelect('calculator')} aria-label="Rechner">
              <div className="magic-button-icon calculator-icon"></div>
              <span>Rechner</span>
          </button>
          <button className="magic-button" onClick={() => handleHologramSelect('flashlight')} aria-label="Lampe">
              <div className="magic-button-icon flashlight-icon"></div>
              <span>Lampe</span>
          </button>
          <button className="magic-button" onClick={() => handleHologramSelect('spirit-level')} aria-label="Waage">
              <div className="magic-button-icon spirit-level-icon"></div>
              <span>Waage</span>
          </button>
          <button className="magic-button" onClick={() => handleHologramSelect('compass')} aria-label="Kompass">
              <div className="magic-button-icon compass-icon"></div>
              <span>Kompass</span>
          </button>
          <div className="legal-buttons-wrapper">
            <button className="legal-button" onClick={() => handleHologramSelect('imprint')} aria-label="Impressum">
              <div className="magic-button-icon imprint-icon">i</div>
              <span>Impressum</span>
            </button>
            <button className="legal-button" onClick={() => handleHologramSelect('privacy')} aria-label="Datenschutz">
              <div className="magic-button-icon privacy-icon"></div>
              <span>Datenschutz</span>
            </button>
          </div>
        </div>

        {appState === 'hologram' && renderHologram(activeHologram)}
      </div>
    </>
  );
};

const container = document.getElementById('root');
if (container) {
  // Initialize root only once to prevent errors in hot-reloading environments
  if (!(container as any)._reactRoot) {
    (container as any)._reactRoot = createRoot(container);
  }
  
  const root: Root = (container as any)._reactRoot;
  root.render(
    <React.StrictMode>
      <HologramApp />
    </React.StrictMode>
  );
}