import assessmentCsv from '../data/Skynet Countdown Log - assessments.csv?raw';
import storyCsv from '../data/Skynet Countdown Log - stories.csv?raw';
import { loadDataset } from './lib/index.ts';

export const dataset = loadDataset(assessmentCsv, storyCsv);

export default dataset;
