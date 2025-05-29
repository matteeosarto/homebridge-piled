import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { GateControlPlatform } from './platform.js';

import axios from 'axios';

export class GatePlatformAccessory {
  private service: Service;
  private myCurrentDoorState: CharacteristicValue | null = null;
  private myTargetDoorState: CharacteristicValue | null = null;
  private openTimeout?: NodeJS.Timeout;
  private autoCloseTimeout?: NodeJS.Timeout;
  private closeCompleteTimeout?: NodeJS.Timeout;

  constructor(
    private readonly platform: GateControlPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'matteeosarto')
      .setCharacteristic(this.platform.Characteristic.Model, 'GateControl')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, '123456789');

    this.service = this.accessory.getService(this.platform.Service.GarageDoorOpener) ||
      this.accessory.addService(this.platform.Service.GarageDoorOpener);

    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);

    this.service.getCharacteristic(this.platform.Characteristic.TargetDoorState)
      .onSet(this.setTargetState.bind(this))
      .onGet(this.getTargetState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentDoorState)
      .onGet(this.getCurrentState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.ObstructionDetected)
      .onGet(this.getObstructionDetected.bind(this));

    //this.platform.log.debug('transactionDuration ' + this.platform.config.transactionDuration);
  }

  async setTargetState(value: CharacteristicValue) {
    //this.platform.log.debug('GateControl setState');
    //this.platform.log.debug('RECEIVED: ' + value);
    this.myTargetDoorState = value;
  
    // Cancella eventuali timeout attivi
    clearTimeout(this.openTimeout);
    clearTimeout(this.autoCloseTimeout);
    clearTimeout(this.closeCompleteTimeout);
  
    if (value === this.platform.Characteristic.TargetDoorState.OPEN) {
      this.myCurrentDoorState = this.platform.Characteristic.CurrentDoorState.OPENING;
      this.service.updateCharacteristic(
        this.platform.Characteristic.CurrentDoorState,
        this.myCurrentDoorState,
      );

      await this.doApiCall();
  
      //Cambio stato OPENING -> OPEN
      this.openTimeout = setTimeout(() => {
        //this.platform.log.debug('Apertura completata');
        this.myCurrentDoorState = this.platform.Characteristic.CurrentDoorState.OPEN;
        this.service.updateCharacteristic(
          this.platform.Characteristic.CurrentDoorState,
          this.myCurrentDoorState,
        );
      }, this.platform.config.transactionMilliseconds);
  
      //Cambio stato OPEN -> CLOSING
      this.autoCloseTimeout = setTimeout(() => {
        if (this.myCurrentDoorState !== this.platform.Characteristic.CurrentDoorState.OPEN) return;
        //this.platform.log.debug('Avvio chiusura automatica');
        this.myTargetDoorState = this.platform.Characteristic.TargetDoorState.CLOSED;
        this.myCurrentDoorState = this.platform.Characteristic.CurrentDoorState.CLOSING;
  
        this.service.updateCharacteristic(
          this.platform.Characteristic.TargetDoorState,
          this.myTargetDoorState,
        );
        this.service.updateCharacteristic(
          this.platform.Characteristic.CurrentDoorState,
          this.myCurrentDoorState,
        );
      }, this.platform.config.transactionMilliseconds + this.platform.config.openMilliseconds);
  
      //Cambio stato CLOSING -> CLOSED
      this.closeCompleteTimeout = setTimeout(() => {
        if (this.myCurrentDoorState !== this.platform.Characteristic.CurrentDoorState.CLOSING) return;
        //this.platform.log.debug('Completamento chiusura automatica');
        this.myCurrentDoorState = this.platform.Characteristic.CurrentDoorState.CLOSED;
        this.service.updateCharacteristic(
          this.platform.Characteristic.CurrentDoorState,
          this.myCurrentDoorState,
        );
      }, (this.platform.config.transactionMilliseconds * 2) + this.platform.config.openMilliseconds);
    } else {
      this.myCurrentDoorState = this.platform.Characteristic.CurrentDoorState.CLOSING;
      this.service.updateCharacteristic(
        this.platform.Characteristic.CurrentDoorState,
        this.myCurrentDoorState,
      );
  
      this.closeCompleteTimeout = setTimeout(() => {
        //this.platform.log.debug('Chiusura completata');
        this.myTargetDoorState = this.platform.Characteristic.TargetDoorState.CLOSED;
        this.myCurrentDoorState = this.platform.Characteristic.CurrentDoorState.CLOSED;
        this.service.updateCharacteristic(
          this.platform.Characteristic.CurrentDoorState,
          this.myCurrentDoorState,
        );
      }, this.platform.config.transactionMilliseconds);
    }
  }

  async getTargetState() {
    //this.platform.log.debug('GateControl getTargetState');

    if(!this.myTargetDoorState)
    {
      return this.platform.Characteristic.TargetDoorState.CLOSED;
    }

    return this.myTargetDoorState;
  }

  async getCurrentState() {
    //this.platform.log.debug('GateControl getCurrentState');

    if(!this.myCurrentDoorState)
    {
      return this.platform.Characteristic.CurrentDoorState.CLOSED;
    }

    return this.myCurrentDoorState;
  }

  async getObstructionDetected() {
    return 0;
  }

  async doApiCall()
  {
    try
    {
      await axios.get(this.platform.config.url, {
      params: {
        protocol: this.platform.config.protocol,
        pulselength: this.platform.config.pulseLength,
        repeattransmit: this.platform.config.repeatTransmit,
        codelength: this.platform.config.codelength,
        code: this.platform.config.code
      }
    });
    }
    catch(ex)
    {
      this.platform.log.error('Errore', ex);
    }
  }
}
