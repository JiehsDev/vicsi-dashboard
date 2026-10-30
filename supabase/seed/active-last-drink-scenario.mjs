import definition from '../../src/lib/scoring/data/csiEnvironment.v1_7.json' with {type:'json'};

// Active development registration only. Historical sessions keep their own versions.
export const ACTIVE_LAST_DRINK_SCENARIO = Object.freeze({
  scenario_id:definition.scenarioId,
  display_name:'The Last Drink',
  scenario_version:definition.scenarioVersion,
  scoring_rules_version:definition.scoringRulesVersion,
  ground_truth_version:definition.groundTruthVersion,
});
