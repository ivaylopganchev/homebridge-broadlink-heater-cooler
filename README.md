# broadlink-heater-cooler-homebridge

simple congif
```
{
    "bridge": {
        "name": "HomeBridge",
        "username": "0E:0A:C2:47:94:2E",
        "port": 51826,
        "pin": "215-93-023"
    },
    "accessories": [
        {
            "accessory": "BroadlinkHeaterCooler",
            "name": "Air Conditioner",
            "mac": "mac address here"
        }
    ],
    "platforms": [
        {
            "platform": "config",
            "name": "Config",
            "port": 8080,
            "sudo": true,
            "temp": "/sys/class/thermal/thermal_zone0/temp",
            "restart": "sudo -n systemctl restart homebridge",
            "log": {
                "method": "systemd",
                "service": "homebridge"
            }
        }
    ]
}
