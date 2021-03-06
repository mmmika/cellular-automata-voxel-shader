"use strict";

var uniq = require('uniq');

var printFloat = function printFloat (v) {
    return (v === v|0 ? v.toPrecision(2) : v.toString(10));
};

var generateComment = function generateComment (what, rule, outOfBoundValue) {
    var comments = [
        '/**',
        ' * ' + what + ' generated by cellular-automata-voxel-shader 0.4.0',
        ' * ',
        ' * Rule format : ' + rule.ruleFormat,
        ' * Rule : ' + rule.ruleString,
        ' * Out of bound value : ' + outOfBoundValue,
        ' */'
    ];

    return comments.join('\n');
};

var generateUniformsAndConstants = function generateUniformsAndConstants () {
    return [
        '// console command',
        '// \'xs -n [iterations] shadername\' : e.g. \'xs -n 20 shadername\'',
        '',
        '// shader inputs',
        '// uniform vec3    iVolumeSize;    // volume size [1-126]',
        '// uniform float   iColorIndex;    // current color index [1-255]',
        '// uniform vec3    iMirror;        // current mirror mode [0-1]',
        '// uniform vec3    iAxis;          // current axis mode [0-1]',
        '// uniform float   iFrame;         // current frame',
        '// uniform float   iNumFrames;     // total number of frames',
        '// uniform float   iIter;          // current frame',
        '// uniform vec4    iRand;          // random numbers',
        '// uniform float   iArgs[8];       // user args',
        '',
        '// built-in functions',
        '// float voxel(vec3 v);'
    ].join('\n')
};

var generateGetVoxelGlsl = function generateGetVoxelGlsl (outOfBoundValue) {
    outOfBoundValue = outOfBoundValue || 0;

    if (outOfBoundValue === 'wrap') {
        return [
            'int getVoxel(const in vec3 currentPos, const in vec3 add) {',
            '  vec3 voxelPos = mod((currentPos + add), iVolumeSize);',
            '  return int(voxel(voxelPos));',
            '}'
        ].join('\n');
    } else if(outOfBoundValue === 'clamp') {
        return [
            'int getVoxel(const in vec3 currentPos, const in vec3 add) {',
            '  vec3 voxelPos = (currentPos + add) ;',
            '  voxelPos = clamp(voxelPos, vec3(0.), iVolumeSize - vec3(1.));',
            '  return int(voxel(voxelPos));',
            '}'
        ].join('\n');
    } else {
        return [
            'int getVoxel(const in vec3 currentPos, const in vec3 add) {',
            '  vec3 voxelPos = (currentPos + add) ;',
            '  if(voxelPos.x < 0. || voxelPos.y < 0. || voxelPos.z < 0. || voxelPos.x >= iVolumeSize.x || voxelPos.y >= iVolumeSize.y || voxelPos.z >= iVolumeSize.z) {',
            '    return ' + outOfBoundValue + ';',
            '  } else {',
            '    return int(voxel(voxelPos));',
            '  }',
            '}'
        ].join('\n');
    }
};

var generateGetNeighbourhood = function generateGetNeighbourhood (neighbourhood) {
    var glsl = [
        'int getNeighbourhood (const in vec3 currentPos) {',
        '  int sum = 0;',
        ''
    ];

    for (var i = 0; i < neighbourhood.length; i++) {
        var neighbour = neighbourhood[i];
        glsl.push('  sum += getVoxel(currentPos, vec3(' + printFloat(neighbour[0]) + ', ' + printFloat(neighbour[1]) + ', ' + printFloat(neighbour[2]) + ')) > 0 ? 1 : 0;');
    }

    glsl.push('', '  return sum;', '}');

    return glsl.join('\n');
};

var generateGetNeighbourhoodCond = function generateGetNeighbourhoodCond (neighbourhood) {
    var glsl = [
        'int getNeighbourhoodCond (const in vec3 currentPos, const in int desiredValue) {',
        '  int sum = 0;',
        ''
    ];

    for (var i = 0; i < neighbourhood.length; i++) {
        var neighbour = neighbourhood[i];
        glsl.push('  sum += getVoxel(currentPos, vec3(' + printFloat(neighbour[0]) + ', ' + printFloat(neighbour[1]) + ', ' + printFloat(neighbour[2]) + ')) == desiredValue ? 1 : 0;');
    }

    glsl.push('', '  return sum;', '}');

    return glsl.join('\n');
};

var generateRandomFunction = function generateRandomFunction () {
    return [
        'float rand(vec3 co, float seed) {',
        '  co = co + vec3(fract(sin(dot(vec2(iRand.x * 4. * 5.9898, seed * 78.5453), vec2(12.9898,78.233))) * 43758.5453));',
        '  return fract(sin(dot(co.xy + vec2(length(co.yz) * 24.0316), vec2(12.9898,78.233)) + dot(co.yz + vec2(length(co.zx) * 24.0316), vec2(12.9898,78.233)) + dot(co.zx + vec2(length(co.xy) * 24.0316), vec2(12.9898,78.233))) * 43758.5453);',
        '}'
    ].join('\n');
};

var compareNumbers = function compareNumbers (a, b) {
    return a - b;
};

var generateEqualityCheck = function generateEqualityCheck (values, variable) {
    var checkString = [],
        groupedValues = [],
        previousValue = null,
        i;

    variable = variable || 'sum';

    if (values && values.length) {
        uniq(values, compareNumbers, true);

        for (i = 0; i < values.length; i++) {
            if (previousValue === values[i] - 1) {
                groupedValues[groupedValues.length - 1].push(values[i]);
            } else {
                groupedValues.push([values[i]]);
            }

            previousValue = values[i];
        }

        for (i = 0; i < groupedValues.length; i++) {
            if (groupedValues[i].length > 1) {
                checkString.push('(' + variable + ' >= ' + groupedValues[i][0] + ' && ' + variable + ' <= ' + groupedValues[i][groupedValues[i].length - 1] + ')');
            } else {
                checkString.push(variable + ' == ' + groupedValues[i][0]);
            }
        }
    } else {
        checkString.push('false');
    }

    return checkString.length > 1 ? '(' + checkString.join(' || ') + ')' : checkString[0];
};

var generateProbabilityCheck = function generateProbabilityCheck(probabilities, sumVariable, positionVariable) {
    var checkString = [],
        groupedValues = [],
        groupProbabilities = [],
        value = null,
        probability = null,
        previousValue = null,
        previousProbability = null,
        i;

    sumVariable = sumVariable || 'sum';
    positionVariable = positionVariable || 'position';

    for (i in probabilities) {
        value = parseInt(i, 10);
        probability = probabilities[i];

        if (previousValue === value - 1 && previousProbability === probability) {
            groupedValues[groupedValues.length - 1].push(value);
        } else {
            groupedValues.push([value]);
            groupProbabilities.push(probability);
        }

        previousValue = value;
        previousProbability = probability;
    }

    for (i = 0; i < groupProbabilities.length; i++) {
        probability = groupProbabilities[i];

        if (probability === 1) {
            if (groupedValues[i].length > 1) {
                checkString.push('(' + sumVariable + ' >= ' + groupedValues[i][0] + ' && ' + sumVariable + ' <= ' + groupedValues[i][groupedValues[i].length - 1] + ')');
            } else {
                checkString.push(sumVariable + ' == ' + groupedValues[i][0]);
            }
        } else if (probability > 0) {
            if (groupedValues[i].length > 1) {
                checkString.push('(' + sumVariable + ' >= ' + groupedValues[i][0] + ' && ' + sumVariable + ' <= ' + groupedValues[i][groupedValues[i].length - 1] + ' && rand(' + positionVariable + ', 1.) < ' + probability + ')');
            } else {
                checkString.push('(' + sumVariable + ' == ' + groupedValues[i][0] + ' && rand(' + positionVariable + ', 1.) < ' + probability + ')');
            }
        }
    }

    return checkString.length > 1 ? '(' + checkString.join(' || ') + ')' : checkString[0];
};

var generateProcessGlslGenerations = function generateProcessGlslGenerations (neighbourhood, stateCount, survival, birth) {
    var glsl = [
        generateGetNeighbourhoodCond(neighbourhood),
        '',
        'int process(const in int currentValue, const in vec3 position) {',
        '  int sum = getNeighbourhoodCond(position, 1);',
        '  if (currentValue == 0 && ' + generateEqualityCheck(birth) + ') {',
        '    return 1;',
        '  } else if (currentValue == 1 && ' + generateEqualityCheck(survival) + ') {',
        '    return 1;',
        '  } else if (currentValue > 0) {',
        '    return int(mod(float(currentValue + 1), ' + printFloat(stateCount) + '));',
        '  }',
        '  return 0;',
        '}'
    ];

    return glsl.join('\n');
};

var generateProcessGlslLife = function generateProcessGlslLife (neighbourhood, survival, birth) {
    var glsl = [
        generateGetNeighbourhood(neighbourhood),
        '',
        'int process(const in int currentValue, const in vec3 position) {',
        '  int sum = getNeighbourhood(position);',
        '  float sumAdd = clamp(iArgs[0], 0., 1.);',
        '  if (currentValue == 0 && ' + generateEqualityCheck(birth) + ') {',
        '    return 1 + int(float(sum) * sumAdd);',
        '  } else if (currentValue > 0 && ' + generateEqualityCheck(survival) + ') {',
        '    return 1 + int(float(sum) * sumAdd);',
        '  }',
        '  return 0;',
        '}'
    ];

    return glsl.join('\n');
};

var generateProcessGlslStochastic = function generateProcessGlslStochastic (neighbourhood, survival, birth) {
    var glsl = [
        generateRandomFunction(),
        '',
        generateGetNeighbourhood(neighbourhood),
        '',
        'int process(const in int currentValue, const in vec3 position) {',
        '  int sum = getNeighbourhood(position);',
        '  float sumAdd = clamp(iArgs[0], 0., 1.);',
        '  if (currentValue == 0 && ' + generateProbabilityCheck(birth) + ') {',
        '    return 1 + int(float(sum) * sumAdd);',
        '  } else if (currentValue > 0 && ' + generateProbabilityCheck(survival) + ') {',
        '    return 1 + int(float(sum) * sumAdd);',
        '  }',
        '  return 0;',
        '}'
    ];

    return glsl.join('\n');
};

var generateProcessGlslVote = function generateProcessGlslVote (neighbourhood, votes) {
    var glsl = [
        generateGetNeighbourhood(neighbourhood),
        '',
        'int process(const in int currentValue, const in vec3 position) {',
        '  int sum = getNeighbourhood(position) + (currentValue > 0 ? 1 : 0);',
        '  float sumAdd = clamp(iArgs[0], 0., 1.);',
        '  if (' + generateEqualityCheck(votes) + ') {',
        '    return 1 + int(float(sum) * sumAdd);',
        '  }',
        '  return 0;',
        '}'
    ];

    return glsl.join('\n');
};

var generateProcessGlslLuky = function generateProcessGlslLuky (neighbourhood, lowSurvival, highSurvival, lowBirth, highBirth) {
    var glsl = [
        generateGetNeighbourhood(neighbourhood),
        '',
        'int process(const in int currentValue, const in vec3 position) {',
        '  int sum = getNeighbourhood(position);',
        '  float sumAdd = clamp(iArgs[0], 0., 1.);',
        '  if (currentValue == 0 && sum >= ' + lowBirth + ' && sum <= ' + highBirth + ') {',
        '    return 1 + int(float(sum) * sumAdd);',
        '  } else if (currentValue > 0 && sum >= ' + lowSurvival + ' && sum <= ' + highSurvival + ') {',
        '    return 1 + int(float(sum) * sumAdd);',
        '  }',
        '  return 0;',
        '}'
    ];

    return glsl.join('\n');
};

var generateProcessGlslNluky = function generateProcessGlslNluky (neighbourhood, stateCount, lowSurvival, highSurvival, lowBirth, highBirth) {
    var glsl = [
        generateGetNeighbourhoodCond(neighbourhood),
        '',
        'int process(const in int currentValue, const in vec3 position) {',
        '  int sum = getNeighbourhoodCond(position, 1);',
        '  if (currentValue == 0 && sum >= ' + lowBirth + ' && sum <= ' + highBirth + ') {',
        '    return 1;',
        '  } else if (currentValue == 1 && sum >= ' + lowSurvival + ' && sum <= ' + highSurvival + ') {',
        '    return 1;',
        '  } else if (currentValue == 1) {',
        '    return ' + (2 % (2 + stateCount * 2)) + ';',
        '  } else if (currentValue >= 2) {',
        '    return int(mod(float(currentValue + 2), ' + printFloat(2 + stateCount * 2) + '));',
        '  }',
        '  return 0;',
        '}'
    ];

    return glsl.join('\n');
};

var generateProcessGlslCyclic = function generateProcessGlslCyclic (neighbourhood, stateCount, threshold, greenbergHastingsModel) {
    var glsl = [
        generateGetNeighbourhoodCond(neighbourhood),
        '',
        'int process(const in int currentValue, const in vec3 position) {',
        '  int nextValue = int(mod(float(currentValue + 1), ' + printFloat(stateCount) + '));',
        '  int sum = getNeighbourhoodCond(position, nextValue);',
        '  if (sum >= ' + threshold + (greenbergHastingsModel ? ' || currentValue > 0' : '') + ') {',
        '    return nextValue;',
        '  }',
        '  return currentValue;',
        '}'
    ];

    return glsl.join('\n');
};

var generateProcessGlsl = function generateProcessGlsl (neighbourhood, rule) {
    if (rule.ruleFormat === 'life' || rule.ruleFormat === 'extended-life') {
        return generateProcessGlslLife(neighbourhood, rule.survival, rule.birth);
    } else if (rule.ruleFormat === 'extended-stochastic') {
        return generateProcessGlslStochastic(neighbourhood, rule.survival, rule.birth);
    } else if (rule.ruleFormat === 'generations' || rule.ruleFormat === 'extended-generations') {
        return generateProcessGlslGenerations(neighbourhood, rule.stateCount, rule.survival, rule.birth);
    } else if (rule.ruleFormat === 'vote') {
        return generateProcessGlslVote(neighbourhood, rule.vote);
    } else if (rule.ruleFormat === 'luky') {
        return generateProcessGlslLuky(neighbourhood, rule.lowSurvival, rule.highSurvival, rule.lowBirth, rule.highBirth);
    } else if (rule.ruleFormat === 'nluky') {
        return generateProcessGlslNluky(neighbourhood, rule.stateCount, rule.lowSurvival, rule.highSurvival, rule.lowBirth, rule.highBirth);
    } else if (rule.ruleFormat === 'cyclic') {
        return generateProcessGlslCyclic(neighbourhood, rule.stateCount, rule.threshold, rule.greenbergHastingsModel);
    }

    throw new Error('Unsupported ruleFormat : ' + rule.ruleFormat);
};

var generateGlsl = function generateGlsl (rule, neighbourhood, outOfBoundValue) {
    var glsl = [
        generateComment('Voxel Shader for MagicaVoxel 0.98.2', rule, outOfBoundValue),
        '',
        generateUniformsAndConstants(),
        '',
        generateGetVoxelGlsl(outOfBoundValue),
        '',
        generateProcessGlsl(neighbourhood, rule),
        '',
        'float map(vec3 v) {',
        '  int currentValue = int(voxel(v));',
        '  return float(process(currentValue, v));',
        '}'
    ];

    return glsl.join('\n')
};

module.exports = generateGlsl;
