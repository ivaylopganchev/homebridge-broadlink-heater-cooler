const events = require('events');
var util = require('util');
let EventEmitter = require('events');
let dgram = require('dgram');
let os = require('os');
let crypto = require('crypto');
const State = require('./state');

const port = 2878;

function AirConditionerApi(log) {
    this.log = log;
    // this.key = new Buffer([0x09, 0x76, 0x28, 0x34, 0x3f, 0xe9, 0x9e, 0x23, 0x76, 0x5c, 0x15, 0x13, 0xac, 0xcf, 0x8b, 0x02]);
    // this.iv = new Buffer([0x56, 0x2e, 0x17, 0x99, 0x6d, 0x09, 0x3d, 0x28, 0xdd, 0xb3, 0xba, 0x69, 0x5a, 0x2e, 0x6f, 0x58]);

};

AirConditionerApi.prototype = {
    connect: function() {
        var interfaces = os.networkInterfaces();
        var timeout = 1000;
        var addresses = [];
        for (var k in interfaces) {
            for (var k2 in interfaces[k]) {
                var address = interfaces[k][k2];
                if (address.family === 'IPv4' && !address.internal) {
                    addresses.push(address.address);
                }
            }
        }
        this.address = addresses[0].split('.');
        this.cs = dgram.createSocket({
            type: 'udp4',
            reuseAddr: true
        })

        var self = this;
        this.cs.on('close', function() {
            self._connectionClose()
        });

        this.cs.on('listening', function() {
            self._connectionListen()
        });

        this.cs.on('message', function(msg, rinfo) {
            self._connectionMessage(msg, rinfo)
        });

        this.cs.bind();

        setTimeout(function() {
            self.cs.close();
        }, timeout);
    },

    discoverDevices: function() {
        var port = this.cs.address().port;
        var now = new Date();
        var starttime = now.getTime();

        var timezone = now.getTimezoneOffset() / -3600;
        var packet = Buffer.alloc(0x30, 0);

        var year = now.getYear();

        if (timezone < 0) {
            packet[0x08] = 0xff + timezone - 1;
            packet[0x09] = 0xff;
            packet[0x0a] = 0xff;
            packet[0x0b] = 0xff;
        } else {
            packet[0x08] = timezone;
            packet[0x09] = 0;
            packet[0x0a] = 0;
            packet[0x0b] = 0;
        }
        packet[0x0c] = year & 0xff;
        packet[0x0d] = year >> 8;
        packet[0x0e] = now.getMinutes();
        packet[0x0f] = now.getHours();
        var subyear = year % 100;
        packet[0x10] = subyear;
        packet[0x11] = now.getDay();
        packet[0x12] = now.getDate();
        packet[0x13] = now.getMonth();
        packet[0x18] = parseInt(this.address[0]);
        packet[0x19] = parseInt(this.address[1]);
        packet[0x1a] = parseInt(this.address[2]);
        packet[0x1b] = parseInt(this.address[3]);
        packet[0x1c] = port & 0xff;
        packet[0x1d] = port >> 8;
        packet[0x26] = 6;
        var checksum = 0xbeaf;

        for (var i = 0; i < packet.length; i++) {
            checksum += packet[i];
        }
        checksum = checksum & 0xffff;
        packet[0x20] = checksum & 0xff;
        packet[0x21] = checksum >> 8;

        this.cs.sendto(packet, 0, packet.length, 80, '255.255.255.255');
    },

    _deviceMac: function(msg) {
        var mac = Buffer.alloc(6, 0);
        msg.copy(mac, 0x00, 0x3F);
        msg.copy(mac, 0x01, 0x3E);
        msg.copy(mac, 0x02, 0x3D);
        msg.copy(mac, 0x03, 0x3C);
        msg.copy(mac, 0x04, 0x3B);
        msg.copy(mac, 0x05, 0x3A);
        return mac
    },

    _createDevice: function(msg, rinfo) {
        this.log('API create device');

        var host = rinfo;

        var mac = this._deviceMac(msg)

        var devtype = msg[0x34] | msg[0x35] << 8;
        if (!this.devices) {
            this.devices = {};
        }
        if (!this.devices[mac]) {
            var factory = new DeviceFactory(this.log)
            var dev = factory.makeDevice(devtype, host, mac, this.cs);
            // console.log('device ->' + dev);

            if (dev) {
                this.devices[mac] = dev;
                dev.auth();
                //        this.emit("deviceReady");
                dev.on("deviceReady", () => {
                    this.log('API dev.on.deviceReady');
                    this.emit("deviceReady", dev);
                    dev.get_ac_info();
                });

                dev.on("onTemp", (status) => {
                    dev.check_power();
                });
                dev.on("updateState", (status) => {
                    this.emit("updateState", status);
                });


                // dev.on("deviceReady", function() {
                //     this.log('API dev.on.deviceReady');
                //     this.emit("deviceReady");
                // });
            }
        }
    },

    _connectionMessage: function(msg, rinfo) {
        this.log('API Connection message');
        this._createDevice(msg, rinfo);
        // this._processResponse(msg, rinfo)
    },

    _connectionListen: function() {
        this.log('API Connection listening');
        this.cs.setBroadcast(true);
        this.discoverDevices();
    },

    _connectionClose: function() {
        this.log('API Connection close');
    },
};

function DeviceFactory(log) {
    this.log = log;
};

DeviceFactory.prototype = {
    makeDevice: function(devtype, host, mac, cs) {
        if (devtype == 0x4E2A) {
            dev = new device(host, mac);
            dev.aircon()
            return dev;
        } else {
            return null;
        }
    }
}




function device(host, mac, timeout = 10) {
    this.host = host;
    this.mac = mac;
    this.emitter = new EventEmitter();
    this.isGet = false;


    this.status = {};
    this.status['temp_now'] = 0;
    this.status['temp'] = 19;
    this.status['fixation_v'] = 0b00000111; //self.STATIC.FIXATION.VERTICAL.AUTO;
    this.status['power'] = 1; //self.STATIC.ONOFF.ON;
    this.status['mode'] = 0b00000000; //self.STATIC.MODE.AUTO;
    this.status['sleep'] = 0; //self.STATIC.ONOFF.OFF;
    this.status['display'] = 1; //self.STATIC.ONOFF.ON;
    this.status['health'] = 0; //self.STATIC.ONOFF.OFF;
    this.status['fixation_h'] = 7; //self.STATIC.FIXATION.HORIZONTAL.LEFT_RIGHT_FIX;
    this.status['fanspeed'] = 0b00000101; //self.STATIC.FAN.AUTO;
    this.status['turbo'] = 0; //self.STATIC.ONOFF.OFF;
    this.status['mute'] = 0; //self.STATIC.ONOFF.OFF;
    this.status['clean'] = 0; //self.STATIC.ONOFF.OFF;
    this.status['mildew'] = 0; //self.STATIC.ONOFF.OFF;

    this.on = this.emitter.on;
    this.emit = this.emitter.emit;
    this.removeListener = this.emitter.removeListener;

    this.timeout = timeout;
    this.count = Math.random() & 0xffff;
    this.key = new Buffer([0x09, 0x76, 0x28, 0x34, 0x3f, 0xe9, 0x9e, 0x23, 0x76, 0x5c, 0x15, 0x13, 0xac, 0xcf, 0x8b, 0x02]);
    this.iv = new Buffer([0x56, 0x2e, 0x17, 0x99, 0x6d, 0x09, 0x3d, 0x28, 0xdd, 0xb3, 0xba, 0x69, 0x5a, 0x2e, 0x6f, 0x58]);
    this.id = new Buffer([0, 0, 0, 0]);
    this.cs = dgram.createSocket({
        type: 'udp4',
        reuseAddr: true
    });
    this.cs.on('listening', function() {
        //this.cs.setBroadcast(true);
    });
    this.cs.on("message", (response, rinfo) => {
        var enc_payload = Buffer.alloc(response.length - 0x38, 0);
        response.copy(enc_payload, 0, 0x38);

        var decipher = crypto.createDecipheriv('aes-128-cbc', this.key, this.iv);
        decipher.setAutoPadding(false);
        var payload = decipher.update(enc_payload);
        var p2 = decipher.final();
        if (p2) {
            payload = Buffer.concat([payload, p2]);
        }

        if (!payload) {
            return false;
        }

        var command = response[0x26];
        var err = response[0x22] | (response[0x23] << 8);

        if (err != 0) return;

        if (command == 0xe9) {
            this.key = Buffer.alloc(0x10, 0);
            payload.copy(this.key, 0, 0x04, 0x14);

            this.id = Buffer.alloc(0x04, 0);
            payload.copy(this.id, 0, 0x00, 0x04);
            this.emit("deviceReady");
        } else if (command == 0xee) {
            this.emit("payload", err, payload);
        }

    });
    this.cs.bind();
    this.type = "Unknown";

}

device.prototype.auth = function() {
    var payload = Buffer.alloc(0x50, 0);
    payload[0x04] = 0x31;
    payload[0x05] = 0x31;
    payload[0x06] = 0x31;
    payload[0x07] = 0x31;
    payload[0x08] = 0x31;
    payload[0x09] = 0x31;
    payload[0x0a] = 0x31;
    payload[0x0b] = 0x31;
    payload[0x0c] = 0x31;
    payload[0x0d] = 0x31;
    payload[0x0e] = 0x31;
    payload[0x0f] = 0x31;
    payload[0x10] = 0x31;
    payload[0x11] = 0x31;
    payload[0x12] = 0x31;
    payload[0x1e] = 0x01;
    payload[0x2d] = 0x01;
    payload[0x30] = 'T'.charCodeAt(0);
    payload[0x31] = 'e'.charCodeAt(0);
    payload[0x32] = 's'.charCodeAt(0);
    payload[0x33] = 't'.charCodeAt(0);
    payload[0x34] = ' '.charCodeAt(0);
    payload[0x35] = ' '.charCodeAt(0);
    payload[0x36] = '1'.charCodeAt(0);

    this.sendPacket(0x65, payload);

}

device.prototype.exit = function() {
    var self = this;
    setTimeout(function() {
        self.cs.close();
    }, 500);
}

device.prototype.getType = function() {
    return this.type;
}

device.prototype.sendPacket = function(command, payload) {
    this.count = (this.count + 1) & 0xffff;
    var packet = Buffer.alloc(0x38, 0);
    packet[0x00] = 0x5a;
    packet[0x01] = 0xa5;
    packet[0x02] = 0xaa;
    packet[0x03] = 0x55;
    packet[0x04] = 0x5a;
    packet[0x05] = 0xa5;
    packet[0x06] = 0xaa;
    packet[0x07] = 0x55;
    packet[0x24] = 0x2a;
    packet[0x25] = 0x27;
    packet[0x26] = command;
    packet[0x28] = this.count & 0xff;
    packet[0x29] = this.count >> 8;
    packet[0x2a] = this.mac[0];
    packet[0x2b] = this.mac[1];
    packet[0x2c] = this.mac[2];
    packet[0x2d] = this.mac[3];
    packet[0x2e] = this.mac[4];
    packet[0x2f] = this.mac[5];
    packet[0x30] = this.id[0];
    packet[0x31] = this.id[1];
    packet[0x32] = this.id[2];
    packet[0x33] = this.id[3];

    var checksum = 0xbeaf;
    for (var i = 0; i < payload.length; i++) {
        checksum += payload[i];
        checksum = checksum & 0xffff;
    }

    var cipher = crypto.createCipheriv('aes-128-cbc', this.key, this.iv);
    payload = cipher.update(payload);
    var p2 = cipher.final();

    packet[0x34] = checksum & 0xff;
    packet[0x35] = checksum >> 8;

    packet = Buffer.concat([packet, payload]);

    checksum = 0xbeaf;
    for (var i = 0; i < packet.length; i++) {
        checksum += packet[i];
        checksum = checksum & 0xffff;
    }
    packet[0x20] = checksum & 0xff;
    packet[0x21] = checksum >> 8;
    console.log("dev send packet to " + this.host.address + ":" + this.host.port);
    this.cs.sendto(packet, 0, packet.length, this.host.port, this.host.address);
}

device.prototype.aircon = function() {
    this.type = "aircon";

    this.set_state = function(state) {
        var payload = Buffer.alloc(23, 0);

        var temperature = 0 //= 20 - 8
        var temperature_05 = 0


        if (this.status['temp'] < 16) {
            temperature = 16 - 8
            temperature_05 = 0
        } else if (this.status['temp'] > 32) {
            temperature = 32 - 8
            temperature_05 = 0
        } else {
            temperature = this.status['temp'] - 8
            temperature_05 = 0
        }

        //0b00000001
        //this.status['mode'] = 0b00000001; //self.STATIC.MODE.AUTO;

        payload[0] = 0xbb
        payload[1] = 0x00
        payload[2] = 0x06 //# Send command, seems like 07 is response
        payload[3] = 0x80
        payload[4] = 0x00
        payload[5] = 0x00
        payload[6] = 0x0f //# Set status .. #02 -> get info?
        payload[7] = 0x00
        payload[8] = 0x01
        payload[9] = 0x01
        payload[10] = 0b00000000 | temperature << 3 | this.status['fixation_v']
        payload[11] = 0b00000000 | this.status['fixation_h'] << 5
        payload[12] = 0b00001111 | temperature_05 << 7 //   # bit 1:  0.5  #bit   if 0b?1 then nothing done....  last 6 is some sort of packet_id
        payload[13] = 0b00000000 | this.status['fanspeed'] << 5
        payload[14] = 0b00000000 | this.status['turbo'] << 6 | this.status['mute'] << 7
        payload[15] = 0b00000000 | this.status['mode'] << 5 | this.status['sleep'] << 2
        payload[16] = 0b00000000
        payload[17] = 0x00
        payload[18] = 0b00000000 | this.status['power'] << 5 | this.status['health'] << 1 | this.status['clean'] << 2
        payload[19] = 0x00
        payload[20] = 0b00000000 | this.status['display'] << 4 | this.status['mildew'] << 3
        payload[21] = 0b00000000
        payload[22] = 0b00000000

        var length = payload.length;

        var request_payload = Buffer.alloc(32, 0);
        request_payload[0] = (length + 2);
        payload.copy(request_payload, 2);


        crc = checksum(payload)
        request_payload[length + 2] = ((crc >> 8) & 0xFF)
        request_payload[length + 3] = crc & 0xFF

        this.sendPacket(0x6a, request_payload);
    }

    this.setTargetTemperature = function(temperature) {
        this.status['temp'] = temperature
        this.set_state()
        // this.log('Setting target temperature:', temperature);
        // callback();
        // this.api.deviceControl(State.TempSet, temperature, function(err) {
        //     if (!!err) this.log('Target temperature set');
        //     callback(err);
        // }.bind(this));
    }

    this.setTargetState = function(state) {

        console.log('state: ' + state)
        if (state == 0) {
            console.log('auto')
            this.status['mode'] = 0b00000000;
        } else if (state == 1) {
            console.log('heat')
            this.status['mode'] = 0b00000100;
        } else if (state == 2) {
            console.log('cool')
            this.status['mode'] = 0b00000001;
        } else {
            this.status['mode'] = 0b00000110;
        }

        this.set_state()


        // this.log('Setting target state:', state);
        // this.set_state()
        // this.api.deviceControl(State.OpMode, mapper.opModeFromTargetState(state), function(err) {
        //     if (!!err) this.log('Target state set');
        //     callback(err);
        // }.bind(this));
    }

    this.setSwingMode = function(enabled) {
        if (enabled) {
            this.status['fixation_v'] = 0b00000110
        } else {
            this.status['fixation_v'] = 0b00000111
        }
        // this.log('Setting swing mode:', enabled);
        this.set_state()
        // this.api.deviceControl(State.Direction, enabled ? Direction.SwingUpDown : Direction.Fixed, function(err) {
        //     if (!!err) this.log('Swing mode set');
        //     callback(err);
        // }.bind(this));
    }

    this.setRotationSpeed = function(speed) {



        // LOW =   0b00000011
        // MID =   0b00000010
        // HIGH =  0b00000001
        // AUTO =  0b00000101 
        // this.status['fanspeed'] = 0b00000101
        if (speed <= 33) {
            this.status['fanspeed'] = 0b00000011
        } else if (speed <= 66) {
            this.status['fanspeed'] = 0b00000010
        } else {
            this.status['fanspeed'] = 0b00000001
        }
        this.set_state()

        // this.log('Setting rotation speed:', speed);
        // callback();
        // this.api.deviceControl(State.WindLevel, mapper.windLevelFromRotationSpeed(speed), function(err) {
        //     if (!!err) this.log('Rotation speed set');
        //     callback(err);
        // }.bind(this));
    }

    this.setActive = function(state) {
        // if (!(state = this.status['power'])) {
        this.status['power'] = state;
        this.set_state()
        // }
        // this.status['mode'] = 0b00000100

    }

    this.check_power = function() {
        this.isGet = true;
        var magicbytes = Buffer.from("0C00BB0006800000020011012B7E0000", "hex");
        var resp = this.sendPacket(0x6a, magicbytes);
    }

    this.get_ac_info = function() {
        this.isTemp = true;
        var magicbytes = Buffer.from("0C00BB0006800000020021011B7E0000", "hex");
        var resp = this.sendPacket(0x6a, magicbytes);
    }

    this.on("payload", (err, payload) => {
        // console.log('on payload: ' + payload)

        if (this.isGet) {

            this.isGet = false;
            var temp = 8 + (payload[12] >> 3) + (0.5 * payload[14] >> 7)
            console.log('temp: ' + temp)
            this.status['temp'] = temp;

            var power = payload[20] >> 5 & 0b00000001
            console.log('power: ' + power)
            this.status['power'] = power

            var fixation_v = payload[12] & 0b00000111
            console.log('fixation_v: ' + fixation_v)
            if (fixation_v == 7) {
                this.status['fixation_v'] = false
            } else {
                this.status['fixation_v'] = true
            }


            var mode = payload[17] >> 5 & 0b00001111
            console.log('mode: ' + mode)

            if (mode == 0) {
                this.status['mode'] = 0b00000000
            } else if (mode == 1) {
                this.status['mode'] = 0b00000001
            } else if (mode == 2) {
                this.status['mode'] = 0b00000010
            } else if (mode == 4) {
                this.status['mode'] = 0b00000100
            } else if (mode == 6) {
                this.status['mode'] = 0b00000110
            } else {
                this.status['mode'] = 0b00000000
            }


            var fanspeed = payload[15] >> 5 & 0b00000111
            console.log('fanspeed: ' + fanspeed)
            if (fanspeed == 1) {
                this.status['fanspeed'] = 0b00000001
            } else if (fanspeed == 2) {
                this.status['fanspeed'] = 0b00000010
            } else if (fanspeed == 3) {
                this.status['fanspeed'] = 0b00000011
            } else {
                this.status['fanspeed'] = 0b00000101
            }
            this.emit("updateState", this.status);

        }

        if (this.isTemp) {
            var ambient_temp = payload[17] & 0b00011111
            this.status['temp_now'] = ambient_temp
            console.log('temp_now: ' + ambient_temp)
            this.isTemp = false;
            this.emit("onTemp", this.status);

        }

    });
}

function checksum(data) {
    // pseudo header: srcip (16), dstip (16), 0 (8), proto (8), udp len (16)
    var len = data.length
    // var protocol = packet.protocol === undefined ? 0x11 : packet.protocol
    var sum = 0
    for (var i = 0; i < len; i += 2) {
        sum += ((data[i] << 8) & 0xff00) + ((data[i + 1]) & 0xff)
    }
    while (sum >> 16) {
        sum = (sum & 0xffff) + (sum >> 16)
    }
    sum = 0xffff ^ sum
    return sum
}




util.inherits(AirConditionerApi, events.EventEmitter);

module.exports = AirConditionerApi;