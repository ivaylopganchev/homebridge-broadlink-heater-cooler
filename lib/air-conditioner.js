const API = require('./air-conditioner-api');
const State = require('./state');
const OpMode = require('./op-mode');
const Direction = require('./direction');
const WindLevel = require('./wind-level');
const mapper = require('./mapper');

var Service, Characteristic;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    mapper.setCharacteristic(Characteristic);

    homebridge.registerAccessory("homebridge-broadlink-heater-cooler", "BroadlinkHeaterCooler", BroadlinkHeaterCooler);
};

function BroadlinkHeaterCooler(log, config) {
    this.log = log;
    this.name = config["name"];
    // this.duid = config["mac"].replace(/:/g, '').replace(/\-/g, '');

    // Set initial state. Done only to not deal with nulls if getters are called before first connection.

    this.currentDeviceState = {};

    this.currentDeviceState[State.Active] = false;
    this.currentDeviceState[State.TempNow] = 20;
    this.currentDeviceState[State.TempSet] = 16;
    this.currentDeviceState[State.OpMode] = OpMode.Cool;
    this.currentDeviceState[State.Direction] = Direction.Fixed;
    this.currentDeviceState[State.WindLevel] = WindLevel.Low;
    this.api = new API(log);

};

BroadlinkHeaterCooler.prototype = {
    getServices: function() {
        this.api.connect();


        // this.api
        //     .on('stateUpdate', this.updateState.bind(this));

        this.api.on("deviceReady", (dev) => { 
            this.dev = dev;
            this.log('BroadlinkHeaterCooler dev.on.deviceReady');
            // dev.getState()
                    // this.emit("deviceReady", dev);
        });

        this.api.on("updateState", (status) => {
            this.updateState(status)
        });

        this.acService = new Service.HeaterCooler(this.name);

        // ACTIVE STATE
        this.acService
            .getCharacteristic(Characteristic.Active)
            .on('get', this.getActive.bind(this))
            .on('set', this.setActive.bind(this));

        // CURRENT TEMPERATURE
        this.acService
            .getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({
                minValue: 0,
                maxValue: 100,
                minStep: 1
            })
            .on('get', this.getCurrentTemperature.bind(this));

        // TARGET TEMPERATURE
        this.acService
            .getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .setProps({
                minValue: 16,
                maxValue: 32,
                minStep: 1
            })
            .on('get', this.getTargetTemperature.bind(this))
            .on('set', this.setTargetTemperature.bind(this));

        this.acService
            .getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .setProps({
                minValue: 16,
                maxValue: 32,
                minStep: 1
            })
            .on('get', this.getTargetTemperature.bind(this))
            .on('set', this.setTargetTemperature.bind(this));

        // TARGET STATE
        this.acService
            .getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .on('get', this.getTargetState.bind(this))
            .on('set', this.setTargetState.bind(this));

        // CURRENT STATE
        this.acService
            .getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .on('get', this.getCurrentState.bind(this));

        // SWING MODE
        this.acService
            .getCharacteristic(Characteristic.SwingMode)
            .on('get', this.getSwingMode.bind(this))
            .on('set', this.setSwingMode.bind(this));

        // ROTATION SPEED
        this.acService
            .getCharacteristic(Characteristic.RotationSpeed)
            .on('get', this.getRotationSpeed.bind(this))
            .on('set', this.setRotationSpeed.bind(this));


        // const package = require('../package.json');
        const informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.SerialNumber, 'asdsad')
            .setCharacteristic(Characteristic.Manufacturer, 'package.author')
            .setCharacteristic(Characteristic.Model, 'package.name')
            .setCharacteristic(Characteristic.FirmwareRevision, 'package.version');

        return [this.acService, informationService];
    },

    // GETTERS
    getActive: function(callback) {
        this.log('Getting active...');
        if (this.dev) {
            this.dev.get_ac_info();
        }
        const power = this.currentDeviceState[State.Power];

        callback(null, power);
    },

    getCurrentTemperature: function(callback) {
        this.log('Getting current temperature...');

        const currentTemperature = this.currentDeviceState[State.TempNow];

        callback(null, currentTemperature);
    },

    getTargetTemperature: function(callback) {
        this.log('Getting target temperature...');

        const targetTemperature = this.currentDeviceState[State.TempSet];

        callback(null, targetTemperature);
    },

    getTargetState: function(callback) {
        this.log('Getting target state...');

        const opMode = this.currentDeviceState[State.OpMode];
        const targetState = mapper.targetStateFromOpMode(opMode);

        this.log('opMode:',opMode);
        this.log('targetState:',targetState);


        callback(null, targetState);
    },

    getCurrentState: function(callback) {
        callback(null, this.currentHeaterCoolerState());
    },

    getSwingMode: function(callback) {
        this.log('Getting swing mode...');

        const direction = this.currentDeviceState[State.Direction];
        const isOscillating = direction === Direction.SwingUpDown

        callback(null, isOscillating);
    },

    getRotationSpeed: function(callback) {
        this.log('Getting rotation speed...');

        const windLevel = this.currentDeviceState[State.WindLevel];
        const rotationSpeed = mapper.rotationSpeedFromWindLevel(windLevel);

        callback(null, rotationSpeed);
    },

    // SETTERS
    setActive: function(isActive, callback) {
        this.log('Setting active:', isActive);
        if (this.dev) {
            this.dev.setActive(isActive);
            this.updateState(dev.status);
        }
        callback();
    },

    setTargetTemperature: function(temperature, callback) {
        this.log('Setting target temperature:', temperature);
        if (this.dev) {
            this.dev.setTargetTemperature(temperature);
            this.updateState(dev.status);
        }
        callback();
    },

    setTargetState: function(state, callback) {
        this.log('Setting target state:', state);
        if (this.dev) {
            this.dev.setTargetState(state);
            this.updateState(dev.status);
        }

        callback();
    },

    setSwingMode: function(enabled, callback) {
        this.log('Setting swing mode:', enabled);
        if (this.dev) {
            this.dev.setSwingMode(enabled);
            this.updateState(dev.status);
        }
        callback();
    },

    setRotationSpeed: function(speed, callback) {
        this.log('Setting rotation speed:', speed);
        if (this.dev) {
            this.dev.setRotationSpeed(speed);
            this.updateState(dev.status);
        }
        callback();
    },

    currentHeaterCoolerState: function() {
        const opMode = this.currentDeviceState[State.OpMode];

         var state;

        if (opMode === OpMode.Cool) {
                state = Characteristic.CurrentHeaterCoolerState.COOLING;
         } else if (opMode === OpMode.Heat) {
                state = Characteristic.CurrentHeaterCoolerState.HEATING;
         } else {
                state = Characteristic.CurrentHeaterCoolerState.IDLE;
         }
    
    return state;
    },

    updateState: function(stateUpdate) {
        this.log("State updated:", JSON.stringify(stateUpdate, Object.values(State)));

        // Merge state update into current device state
        this.currentDeviceState = Object.assign({}, this.currentDeviceState, stateUpdate);

        // Update characteristics which correspond to updated states
        Object.keys(stateUpdate).forEach(function(key) {
            this.updateCharacteristic(key, stateUpdate[key]);
        }.bind(this));

        this.updateDerivedCharacteristics();
    },

    updateCharacteristic: function(name, value) {
        var characteristic;
        var mappedValue;

        switch (name) {
            case State.Power:
                characteristic = Characteristic.Active;
                mappedValue = Boolean(value);
                break;
            case State.TempNow:
                characteristic = Characteristic.CurrentTemperature;
                mappedValue = value;
                break;
            case State.OpMode:
                characteristic = Characteristic.TargetHeaterCoolerState;
                mappedValue = mapper.targetStateFromOpMode(value);
                break;
            case State.Direction:
                characteristic = Characteristic.SwingMode;
                mappedValue = value;
                break;
            case State.WindLevel:
                characteristic = Characteristic.RotationSpeed;
                mappedValue = mapper.rotationSpeedFromWindLevel(value);
                break;
        }

        if (!!characteristic) {
            this.acService.getCharacteristic(characteristic).updateValue(mappedValue);
        }
    },

    updateDerivedCharacteristics: function() {
        const targetTemperature = this.currentDeviceState[State.TempSet];
        this.log('this.currentHeaterCoolerState()', this.currentHeaterCoolerState());
        this.acService.getCharacteristic(Characteristic.CurrentHeaterCoolerState).updateValue(this.currentHeaterCoolerState());
        this.acService.getCharacteristic(Characteristic.HeatingThresholdTemperature).updateValue(targetTemperature);
        this.acService.getCharacteristic(Characteristic.CoolingThresholdTemperature).updateValue(targetTemperature);
    },
};