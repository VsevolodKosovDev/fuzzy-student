/**
 * fuzzy-lib — библиотека нечётких величин с функцией принадлежности
 * распределения Стьюдента T(x₀, s, ν).
 *
 * Публичный API (аналог fuzzy_lib/__init__.py из примера):
 *   FuzzyStudent, FuzzySet, generateSet, hierarchical, kmeans, Logger,
 *   а также датчики случайных чисел и статистики по табл. 2.2.7.
 */
export {
  FuzzyStudent,
  EPS,
  fmt,
  type FuzzyStudentDict,
  type Operation,
  type OperationResult,
  type ComparisonResult,
  type AlphaCut,
  type TheoreticalMoments,
} from "./FuzzyStudent.js";
export {
  FuzzySet,
  alphaDegree,
  passesAlpha,
  intersectAlphaCuts,
  maxCommonAlpha,
  type CutIntersection,
  type AlphaCriterion,
  type Range,
  type RangeFilter,
} from "./FuzzySet.js";
export {
  buildHierarchy,
  cutHierarchy,
  hierarchical,
  dendrogramLinks,
  LINKAGE_NAMES,
  type LinkageMethod,
  type Merge,
  type HierarchyTree,
  type HierarchicalResult,
  type CutBy,
  type DendrogramLink,
} from "./hierarchical.js";
export { generateSet, GENERATE_MIN, GENERATE_MAX, type GenerateOptions } from "./generator.js";
export {
  kmeans,
  distance,
  fuzzyDistance,
  toPoint,
  type KMeansResult,
  type KMeansOptions,
  type Point,
} from "./kmeans.js";
export { Logger, timestamp, type LogSink } from "./logger.js";
export {
  defaultRng,
  seededRng,
  uniform,
  normalBook,
  studentStandard,
  NORMAL_TERMS,
  type Rng,
} from "./random.js";
export { sampleStatistics, centralMoment, type SampleStatistics } from "./stats.js";
export { lnGamma, gamma } from "./special.js";
