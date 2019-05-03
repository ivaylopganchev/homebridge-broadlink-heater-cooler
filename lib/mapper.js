const OpMode = require('./op-mode');
const WindLevel = require('./wind-level');

var Characteristic;

module.exports.setCharacteristic = function(characteristic) {
    Characteristic = characteristic;
}

module.exports.opModeFromTargetState = function (targetState) {
    switch (targetState) {
        case Characteristic.TargetHeaterCoolerState.COOL: return OpMode.Cool;
        case Characteristic.TargetHeaterCoolerState.HEAT: return OpMode.Heat;
        case Characteristic.TargetHeaterCoolerState.AUTO: return OpMode.Auto;
    }
};

module.exports.targetStateFromOpMode = function (targetState) {
    return Characteristic.TargetHeaterCoolerState.COOL;

    if (targetState == OpMode.Cool) {
        console.log('OpMode.Cool');
        console.log(Characteristic.TargetHeaterCoolerState.COOL);        
        return Characteristic.TargetHeaterCoolerState.COOL;
    } else if (targetState == OpMode.Heat) {
        console.log('OpMode.Heat');
        console.log(Characteristic.TargetHeaterCoolerState.HEAT);        
        return Characteristic.TargetHeaterCoolerState.HEAT;
    } else if (targetState == OpMode.Auto) {
        console.log('OpMode.Auto');
        console.log(Characteristic.TargetHeaterCoolerState.AUTO);
        return Characteristic.TargetHeaterCoolerState.AUTO;
    } else {
        return Characteristic.TargetHeaterCoolerState.AUTO;
    }
};

module.exports.rotationSpeedFromWindLevel = function (windLevel) {
    switch (windLevel) {
        case WindLevel.Low: return 25;
        case WindLevel.Mid: return 50;
        case WindLevel.High: return 100;
    }
};

module.exports.windLevelFromRotationSpeed = function (rotationSpeed) {
    if (rotationSpeed == 0) {
        return WindLevel.Auto;
    } else if (rotationSpeed <= 25) {
        return WindLevel.Low;
    } else if (rotationSpeed <= 50) {
        return WindLevel.Mid;
    } else if (rotationSpeed <= 75) {
        return WindLevel.High;
    } else {
        return WindLevel.High;
    }
}