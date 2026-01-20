import type { CommandDescriptor } from '../../../domain/pret';

export const PRET_COMMAND_DESCRIPTORS: CommandDescriptor[] = [
  {
    name: 'listModels',
    description: 'List all cubes/models in the package with their dimensions',
    examples: [
      'list models',
      'what cubes do I have',
      'show me the models',
      'how many cubes are there'
    ],
    args: [
      {
        name: 'includeDetails',
        description: 'Whether to include detailed information about each model',
        required: false,
        type: 'boolean'
      }
    ]
  },
  {
    name: 'listDimensions',
    description: 'List all dimensions in the package',
    examples: [
      'list dimensions',
      'what dimensions exist',
      'show all dimensions',
      'how many dimensions are there'
    ],
    args: [
      {
        name: 'modelName',
        description: 'Filter dimensions by model/cube name',
        required: false,
        type: 'string'
      },
      {
        name: 'dimensionType',
        description: 'Filter by dimension type (account, time, version, etc.)',
        required: false,
        type: 'string'
      }
    ]
  },
  {
    name: 'getCubeDetails',
    description: 'Get detailed information about a specific cube/model including its dimensions',
    examples: [
      'tell me about the PL cube',
      'show details for Benchmarking model',
      'what is in the CashFlow cube',
      'describe the BalanceSheet model'
    ],
    args: [
      {
        name: 'cubeName',
        description: 'The name of the cube/model to get details for',
        required: true,
        type: 'string',
        examples: ['PL', 'Benchmarking', 'CashFlow', 'BalanceSheet']
      }
    ]
  },
  {
    name: 'getDimensionDetails',
    description: 'Get detailed information about a specific dimension including member count and properties',
    examples: [
      'tell me about the Account dimension',
      'show the Time dimension',
      'how many members does Account have',
      'describe Version dimension',
      'account dim details'
    ],
    args: [
      {
        name: 'dimensionName',
        description: 'The name of the dimension to get details for',
        required: true,
        type: 'string',
        examples: ['Account', 'Time', 'Version', 'Entity', 'Currency']
      },
      {
        name: 'modelName',
        description: 'Optionally filter to a specific model',
        required: false,
        type: 'string'
      }
    ]
  },
  {
    name: 'createOtherDimension',
    description: 'Create a new dimension in the package and add it to a model. This creates the dimension YAML file and updates the model to reference it. Currently only OtherDimension type is fully implemented.',
    examples: [
      'create a new dimension',
      'add a dimension to the model',
      'create an OtherDimension called Region',
      'add a new dimension named Department to the Benchmarking model',
      'I need to create a dimension for tracking projects',
      'create an Other type dimension called Category'
    ],
    args: [
      {
        name: 'modelName',
        description: 'The name of the model/cube to add the dimension to. Must be an existing model in the package.',
        required: true,
        type: 'string',
        examples: ['Benchmarking', 'PL', 'CashFlow']
      },
      {
        name: 'dimensionName',
        description: 'The name for the new dimension. This will be used as the dimension name and database name.',
        required: true,
        type: 'string',
        examples: ['Region', 'Department', 'Project', 'Category']
      },
      {
        name: 'dimensionKind',
        description: 'The kind/type of dimension to create. Currently only OtherDimension is fully supported.',
        required: true,
        type: 'string',
        examples: ['OtherDimension']
      },
      {
        name: 'dimensionDescription',
        description: 'A description of what this dimension represents.',
        required: false,
        type: 'string'
      }
    ]
  }
];
