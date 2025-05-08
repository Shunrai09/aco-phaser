import Phaser from 'phaser';
import { ACOScene } from './scenes/ACOscene';

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 800,
  backgroundColor: '#000011',
  scene: ACOScene
};

new Phaser.Game(config);
