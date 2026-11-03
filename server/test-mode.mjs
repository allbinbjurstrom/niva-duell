import {randomUUID} from 'node:crypto';
import {RULES} from '../shared/rules.mjs';

// Explicitly requested placeholders, used only by the separate solo test mode.
export function testQuestions(){
  return Array.from({length:RULES.questions},(_,i)=>({
    id:'test-'+randomUUID(),section:'TEST',number:i+1,pages:[],paperId:'',
    title:`Testfråga ${i+1}`,sourceUrl:'',prompt:'Vilket alternativ är rätt?',
    options:['A','B','C'],optionLabels:{A:'Fel alternativ',B:'Fel alternativ',C:'Rätt alternativ'},answer:'C'
  }));
}

export const TEST_SPAWNS=[{x:-4,z:-9,yaw:-Math.PI/2},{x:4,z:-9,yaw:Math.PI/2}];
