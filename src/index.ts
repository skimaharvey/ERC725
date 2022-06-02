/*
    This file is part of @erc725/erc725.js.
    @erc725/erc725.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    @erc725/erc725.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.
    You should have received a copy of the GNU Lesser General Public License
    along with @erc725/erc725.js.  If not, see <http://www.gnu.org/licenses/>.
*/

/**
 * @file index.ts
 * @author Robert McLeod <@robertdavid010>, Fabian Vogelsteller <fabian@lukso.network>
 * @date 2020
 */

import { hexToNumber, isAddress, leftPad, toHex } from 'web3-utils';

import { Web3ProviderWrapper } from './providers/web3ProviderWrapper';
import { EthereumProviderWrapper } from './providers/ethereumProviderWrapper';

import {
  encodeArrayKey,
  getSchemaElement,
  decodeData,
  decodeKeyValue,
  decodeKey,
  isDataAuthentic,
  encodeData,
  convertIPFSGatewayUrl,
} from './lib/utils';

import { getSchema } from './lib/schemaParser';
import { isValidSignature } from './lib/isValidSignature';

import {
  LSP6_ALL_PERMISSIONS,
  LSP6_DEFAULT_PERMISSIONS,
  SUPPORTED_HASH_FUNCTION_STRINGS,
} from './lib/constants';
import { encodeKeyName } from './lib/encodeKeyName';

// Types
import { URLDataWithHash, KeyValuePair, EncodeDataInput } from './types';
import { ERC725Config } from './types/Config';
import { Permissions } from './types/Method';
import {
  ERC725JSONSchema,
  ERC725JSONSchemaKeyType,
  ERC725JSONSchemaValueContent,
  ERC725JSONSchemaValueType,
} from './types/ERC725JSONSchema';

export {
  ERC725JSONSchema,
  ERC725JSONSchemaKeyType,
  ERC725JSONSchemaValueContent,
  ERC725JSONSchemaValueType,
};

export { ERC725Config, KeyValuePair, ProviderTypes } from './types';
export { flattenEncodedData, encodeData } from './lib/utils';
/**
 * This package is currently in early stages of development, <br/>use only for testing or experimentation purposes.<br/>
 *
 * @typeParam Schema
 *
 */
export class ERC725 {
  options: ERC725Config & {
    schemas: ERC725JSONSchema[];
    address?: string;
    provider?;
  };

  /**
   * Creates an instance of ERC725.
   * @param {ERC725JSONSchema[]} schema More information available here: [LSP-2-ERC725YJSONSchema](https://github.com/lukso-network/LIPs/blob/master/LSPs/LSP-2-ERC725YJSONSchema.md)
   * @param {string} address Address of the ERC725 contract you want to interact with
   * @param {any} provider
   * @param {ERC725Config} config Configuration object.
   *
   */
  constructor(
    schemas: ERC725JSONSchema[],
    address?,
    provider?: any,
    config?: ERC725Config,
  ) {
    // NOTE: provider param can be either the provider, or and object with {provider:xxx ,type:xxx}

    // TODO: Add check for schema format?
    if (!schemas) {
      throw new Error('Missing schema.');
    }

    const defaultConfig = {
      ipfsGateway: 'https://cloudflare-ipfs.com/ipfs/',
    };

    this.options = {
      schemas: this.validateSchemas(schemas),
      address,
      provider: this.initializeProvider(provider),
      ipfsGateway: config?.ipfsGateway
        ? convertIPFSGatewayUrl(config?.ipfsGateway)
        : defaultConfig.ipfsGateway,
    };
  }

  /**
   * To prevent weird behovior from the lib, we must make sure all the schemas are correct before loading them.
   *
   * @param schemas
   * @returns
   */
  // eslint-disable-next-line class-methods-use-this
  private validateSchemas(schemas: ERC725JSONSchema[]) {
    return schemas.filter((schema) => {
      const encodedKeyName = encodeKeyName(schema.name);
      const isKeyValid = schema.key === encodedKeyName;

      if (!isKeyValid) {
        console.log(
          `The schema with keyName: ${schema.key} is skipped because its key hash does not match its key name (expected: ${encodedKeyName}, got: ${schema.key}).`,
        );
      }

      return isKeyValid;
    });
  }

  // eslint-disable-next-line class-methods-use-this
  private initializeProvider(providerOrProviderWrapper) {
    // do not fail on no-provider
    if (!providerOrProviderWrapper) return undefined;

    if (typeof providerOrProviderWrapper.request === 'function')
      return new EthereumProviderWrapper(providerOrProviderWrapper);

    if (
      !providerOrProviderWrapper.request &&
      typeof providerOrProviderWrapper.send === 'function'
    )
      return new Web3ProviderWrapper(providerOrProviderWrapper);

    throw new Error(
      `Incorrect or unsupported provider ${providerOrProviderWrapper}`,
    );
  }

  /**
   * Gets **decoded data** for one, many or all keys of the specified `ERC725` smart-contract.
   * When omitting the `keyOrKeys` parameter, it will get all the keys (as per {@link ERC725JSONSchema | ERC725JSONSchema} definition).
   *
   * Data returned by this function does not contain external data of [`JSONURL`](https://github.com/lukso-network/LIPs/blob/master/LSPs/LSP-2-ERC725YJSONSchema.md#jsonurl)
   * or [`ASSETURL`](https://github.com/lukso-network/LIPs/blob/master/LSPs/LSP-2-ERC725YJSONSchema.md#asseturl) schema elements.
   *
   * If you would like to receive everything in one go, you can use {@link ERC725.fetchData | `fetchData`} for that.
   *
   * @param {(string|string[])} keyOrKeys The name (or the encoded name as the schema ‘key’) of the schema element in the class instance’s schema.
   *
   * @returns If the input is an array: an object with schema element key names as properties, with corresponding **decoded** data as values. If the input is a string, it directly returns the **decoded** data.
   */
  async getData(keyOrKeys?: string): Promise<any>;
  async getData(keyOrKeys?: string[]): Promise<{ [key: string]: any }>;
  async getData(keyOrKeys?: undefined): Promise<{ [key: string]: any }>;
  async getData(
    keyOrKeys?: string | string[] | undefined,
  ): Promise<any | { [key: string]: any }>;
  async getData(
    keyOrKeys?: string | string[] | undefined,
  ): Promise<any | { [key: string]: any }> {
    this.getAddressAndProvider();

    if (!keyOrKeys) {
      // eslint-disable-next-line no-param-reassign
      keyOrKeys = this.options.schemas.map((element) => element.name);
    }

    return Array.isArray(keyOrKeys)
      ? this.getDataMultiple(keyOrKeys)
      : this.getDataSingle(keyOrKeys);
  }

  /**
   * Since {@link ERC725.getData | `getData`} exclusively returns data that is stored on the blockchain, `fetchData` comes in handy.
   * Additionally to the data from the blockchain, `fetchData` also returns data from IPFS or HTTP(s) endpoints
   * stored as [`JSONURL`](https://github.com/lukso-network/LIPs/blob/master/LSPs/LSP-2-ERC725YJSONSchema.md#jsonurl) or [`ASSETURL`](https://github.com/lukso-network/LIPs/blob/master/LSPs/LSP-2-ERC725YJSONSchema.md#asseturl).
   *
   * To ensure **data authenticity** `fetchData` compares the `hash` of the fetched JSON with the `hash` stored on the blockchain.
   *
   * @param {(string|string[])} keyOrKeys The name (or the encoded name as the schema ‘key’) of the schema element in the class instance’s schema.
   *
   * @returns Returns the fetched and decoded value depending ‘valueContent’ for the schema element, otherwise works like getData.
   */
  async fetchData(keyOrKeys: string): Promise<any>;
  async fetchData(keyOrKeys: string[]): Promise<{ [key: string]: any }>;
  async fetchData(keyOrKeys: undefined): Promise<{ [key: string]: any }>;
  async fetchData(
    keyOrKeys?: string | string[] | undefined,
  ): Promise<any | { [key: string]: any }>;
  async fetchData(
    keyOrKeys?: string | string[],
  ): Promise<any | { [key: string]: any }> {
    // This is a quick hack to not change the behaviour of the getDataFromExternalSources function.
    // As it expects an object with the key being the schema key.
    const keys =
      Array.isArray(keyOrKeys) || !keyOrKeys ? keyOrKeys : [keyOrKeys];

    const dataFromChain = await this.getData(keys);
    const dataFromExternalSources = await this.getDataFromExternalSources(
      dataFromChain,
    );

    const results = {
      ...dataFromChain,
      ...dataFromExternalSources,
    };

    if (typeof keyOrKeys === 'string') {
      if (Object.prototype.hasOwnProperty.call(results, keyOrKeys)) {
        return results[keyOrKeys];
      }

      return null;
    }

    return results;
  }

  /**
   * Parses a hashed key or a list of hashed keys and will attempt to return its corresponding LSP-2 ERC725YJSONSchema object.
   * The function will look for a corresponding key within the schemas:
   *  - in `./schemas` folder
   *  - provided at initialisation
   *  - provided in the function call
   *
   * @param keyOrKeys The hashed key or array of keys for which you want to find the corresponding LSP-2 ERC725YJSONSchema.
   * @param providedSchemas If you provide your own ERC725JSONSchemas, the parser will also try to find a key match against these schemas.
   */
  getSchema(
    keyOrKeys: string[],
    providedSchemas?: ERC725JSONSchema[],
  ): Record<string, ERC725JSONSchema | null>;
  getSchema(
    keyOrKeys: string,
    providedSchemas?: ERC725JSONSchema[],
  ): ERC725JSONSchema | null;
  getSchema(
    keyOrKeys: string | string[],
    providedSchemas?: ERC725JSONSchema[],
  ): ERC725JSONSchema | null | Record<string, ERC725JSONSchema | null> {
    return getSchema(
      keyOrKeys,
      this.options.schemas.concat(providedSchemas || []),
    );
  }

  private getDataFromExternalSources(dataFromChain: { [key: string]: any }): {
    [key: string]: any;
  } {
    return Object.entries(dataFromChain)
      .filter(([key]) => {
        const keySchema = getSchemaElement(this.options.schemas, key);
        return ['jsonurl', 'asseturl'].includes(
          keySchema.valueContent.toLowerCase(),
        );
      })
      .reduce(async (accumulator, [key, dataEntry]) => {
        if (!dataEntry) {
          accumulator[key] = null;
          return accumulator;
        }

        let receivedData;
        try {
          const { url } = this.patchIPFSUrlsIfApplicable(dataEntry);
          receivedData = await fetch(url).then(async (response) => {
            if (
              dataEntry.hashFunction ===
              SUPPORTED_HASH_FUNCTION_STRINGS.KECCAK256_BYTES
            ) {
              return response
                .arrayBuffer()
                .then((buffer) => new Uint8Array(buffer));
            }

            return response.json();
          });
        } catch (error) {
          console.error(error, `GET request to ${dataEntry.url} failed`);
          throw error;
        }

        accumulator[key] = isDataAuthentic(
          receivedData,
          dataEntry.hash,
          dataEntry.hashFunction,
        )
          ? receivedData
          : null;

        return accumulator;
      }, {});
  }

  /**
   * To be able to store your data on the blockchain, you need to encode it according to your {@link ERC725JSONSchema}.
   *
   * @param {{ [key: string]: any }} data An object with one or many properties, containing the data that needs to be encoded.
   * @param schemas Additionnal ERC725JSONSchemas which will be concatenated with the schemas provided on init.
   *
   * @returns An object with hashed keys and encoded values.
   *
   * When encoding JSON it is possible to pass in the JSON object and the URL where it is available publicly.
   * The JSON will be hashed with `keccak256`.
   */
  encodeData(data: EncodeDataInput, schemas?: ERC725JSONSchema[]) {
    return encodeData(
      data,
      Array.prototype.concat(this.options.schemas, schemas),
    );
  }

  /**
   * To be able to store your data on the blockchain, you need to encode it according to your {@link ERC725JSONSchema}.
   *
   * @param {{ [key: string]: any }} data An object with one or many properties, containing the data that needs to be encoded.
   * @param schemas ERC725JSONSchemas which will be used to encode the keys.
   *
   * @returns An object with hashed keys and encoded values.
   *
   * When encoding JSON it is possible to pass in the JSON object and the URL where it is available publicly.
   * The JSON will be hashed with `keccak256`.
   */
  static encodeData(data: EncodeDataInput, schemas: ERC725JSONSchema[]) {
    return encodeData(data, schemas);
  }

  /**
   * In case you are reading the key-value store from an ERC725 smart-contract key-value store
   * without `@erc725/erc725.js` you can use `decodeData` to do the decoding for you.
   *
   * It is more convenient to use {@link ERC725.fetchData | `fetchData`}.
   * It does the `decoding` and `fetching` of external references for you automatically.
   *
   * @param {{ [key: string]: any }} data An object with one or many properties.
   * @returns Returns decoded data as defined and expected in the schema:
   */
  decodeData(data: { [key: string]: any }): { [key: string]: any } {
    return decodeData(data, this.options.schemas);
  }

  /**
   * An added utility method which simply returns the owner of the contract.
   * Not directly related to ERC725 specifications.
   *
   * @param {string} [address]
   * @returns The address of the contract owner as stored in the contract.
   *
   *    This method is not yet supported when using the `graph` provider type.
   *
   * ```javascript title="Example"
   * await myERC725.getOwner();
   * // '0x94933413384997F9402cc07a650e8A34d60F437A'
   *
   * await myERC725.getOwner("0x3000783905Cc7170cCCe49a4112Deda952DDBe24");
   * // '0x7f1b797b2Ba023Da2482654b50724e92EB5a7091'
   * ```
   */
  async getOwner(_address?: string) {
    const { address, provider } = this.getAddressAndProvider();

    return provider.getOwner(_address || address);
  }

  /**
   * A helper function which checks if a signature is valid according to the EIP-1271 standard.
   *
   * @param messageOrHash if it is a 66 chars string with 0x prefix, it will be considered as a hash (keccak256). If not, the message will be wrapped as follows: "\x19Ethereum Signed Message:\n" + message.length + message and hashed.
   * @param signature
   * @returns true if isValidSignature call on the contract returns the magic value. false otherwise
   */
  async isValidSignature(
    messageOrHash: string,
    signature: string,
  ): Promise<boolean> {
    if (!this.options.address || !isAddress(this.options.address)) {
      throw new Error('Missing ERC725 contract address.');
    }
    if (!this.options.provider) {
      throw new Error('Missing provider.');
    }

    return isValidSignature(
      messageOrHash,
      signature,
      this.options.address,
      this.options.provider,
    );
  }

  /**
   * @internal
   * @param schema associated with the schema with keyType = 'Array'
   *               the data includes the raw (encoded) length key-value pair for the array
   * @param data array of key-value pairs, one of which is the length key for the schema array
   *             Data can hold other field data not relevant here, and will be ignored
   * @return an array of keys/values
   */
  private async getArrayValues(
    schema: ERC725JSONSchema,
    data: Record<string, any>,
  ) {
    if (schema.keyType !== 'Array') {
      throw new Error(
        `The "getArrayValues" method requires a schema definition with "keyType: Array",
         ${schema}`,
      );
    }
    const results: { key: string; value }[] = [];

    // 1. get the array length
    const value = data[schema.key]; // get the length key/value pair

    if (!value || !value.value) {
      return results;
    } // Handle empty/non-existent array

    const arrayLength = await decodeKeyValue(
      'Number',
      'uint256',
      value.value,
      schema.name,
    ); // get the int array length

    const arrayElementKeys: string[] = [];
    for (let index = 0; index < arrayLength; index++) {
      const arrayElementKey = encodeArrayKey(schema.key, index);
      if (!data[arrayElementKey]) {
        arrayElementKeys.push(arrayElementKey);
      }
    }

    try {
      const arrayElements = await this.options.provider?.getAllData(
        this.options.address as string,
        arrayElementKeys,
      );

      results.push(...arrayElements);
    } catch (err) {
      // This case may happen if user requests an array key which does not exist in the contract.
      // In this case, we simply skip
    }

    return results;
  }

  private async getDataSingle(data: string) {
    const keySchema = getSchemaElement(this.options.schemas, data);
    const rawData = await this.options.provider?.getData(
      this.options.address as string,
      keySchema.key,
    );

    // Decode and return the data
    if (keySchema.keyType.toLowerCase() === 'array') {
      const dataKeyValue = {
        [keySchema.key]: { key: keySchema.key, value: rawData },
      };

      const arrayValues = await this.getArrayValues(keySchema, dataKeyValue);

      if (arrayValues && arrayValues.length > 0) {
        arrayValues.push(dataKeyValue[keySchema.key]); // add the raw data array length
        return decodeKey(keySchema, arrayValues);
      }

      return []; // return empty object if there are no arrayValues
    }

    return decodeKey(keySchema, rawData);
  }

  private async getDataMultiple(keyNames: string[]) {
    const keyHashes = keyNames.map((keyName) => {
      const schemaElement = getSchemaElement(this.options.schemas, keyName);
      return schemaElement.key;
    });

    // Get all the raw data from the provider based on schema key hashes
    const allRawData: KeyValuePair[] = await this.options.provider?.getAllData(
      this.options.address as string,
      keyHashes,
    );

    const tmpData = allRawData.reduce<{ [key: string]: any }>(
      (accumulator, current) => {
        accumulator[current.key] = current.value;
        return accumulator;
      },
      {},
    );

    // Get missing 'Array' fields for all arrays, as necessary
    const arraySchemas = this.options.schemas.filter(
      (e) => e.keyType.toLowerCase() === 'array',
    );

    // eslint-disable-next-line no-restricted-syntax
    for (const keySchema of arraySchemas) {
      const dataKeyValue = {
        [keySchema.key]: { key: keySchema.key, value: tmpData[keySchema.key] },
      };
      const arrayValues = await this.getArrayValues(keySchema, dataKeyValue);

      if (arrayValues && arrayValues.length > 0) {
        arrayValues.push(dataKeyValue[keySchema.key]); // add the raw data array length
        tmpData[keySchema.key] = arrayValues;
      }
    }

    return decodeData(tmpData, this.options.schemas);
  }

  /**
   * Changes the protocol from `ipfs://` to `http(s)://` and adds the selected IPFS gateway.
   * `ipfs://QmbKvCVEePiDKxuouyty9bMsWBAxZDGr2jhxd4pLGLx95D => https://ipfs.lukso.network/ipfs/QmbKvCVEePiDKxuouyty9bMsWBAxZDGr2jhxd4pLGLx95D`
   */
  private patchIPFSUrlsIfApplicable(
    receivedData: URLDataWithHash,
  ): URLDataWithHash {
    if (
      receivedData &&
      receivedData.url &&
      receivedData.url.indexOf('ipfs://') !== -1
    ) {
      return {
        ...receivedData,
        url: receivedData.url.replace('ipfs://', this.options.ipfsGateway),
      };
    }

    return receivedData;
  }

  private getAddressAndProvider() {
    if (!this.options.address || !isAddress(this.options.address)) {
      throw new Error('Missing ERC725 contract address.');
    }
    if (!this.options.provider) {
      throw new Error('Missing provider.');
    }

    return {
      address: this.options.address,
      provider: this.options.provider,
    };
  }

  /**
   * Encode permissions into a hexadecimal string as defined by the LSP6 KeyManager Standard.
   *
   * @link https://github.com/lukso-network/LIPs/blob/main/LSPs/LSP-6-KeyManager.md LSP6 KeyManager Standard.
   * @param permissions The permissions you want to specify to be included or excluded. Any ommitted permissions will default to false.
   * @returns {*} The permissions encoded as a hexadecimal string as defined by the LSP6 Standard.
   */
  static encodePermissions(permissions: Permissions): string {
    const result = Object.keys(permissions).reduce((previous, key) => {
      return permissions[key]
        ? previous + hexToNumber(LSP6_DEFAULT_PERMISSIONS[key])
        : previous;
    }, 0);

    return leftPad(toHex(result), 64);
  }

  /**
   * Encode permissions into a hexadecimal string as defined by the LSP6 KeyManager Standard.
   *
   * @link https://github.com/lukso-network/LIPs/blob/main/LSPs/LSP-6-KeyManager.md LSP6 KeyManager Standard.
   * @param permissions The permissions you want to specify to be included or excluded. Any ommitted permissions will default to false.
   * @returns {*} The permissions encoded as a hexadecimal string as defined by the LSP6 Standard.
   */
  encodePermissions(permissions: Permissions): string {
    return ERC725.encodePermissions(permissions);
  }

  /**
   * Decodes permissions from hexadecimal as defined by the LSP6 KeyManager Standard.
   *
   * @link https://github.com/lukso-network/LIPs/blob/main/LSPs/LSP-6-KeyManager.md LSP6 KeyManager Standard.
   * @param permissionHex The permission hexadecimal value to be decoded.
   * @returns Object specifying whether default LSP6 permissions are included in provided hexademical string.
   */
  static decodePermissions(permissionHex: string) {
    const result = {
      CHANGEOWNER: false,
      CHANGEPERMISSIONS: false,
      ADDPERMISSIONS: false,
      SETDATA: false,
      CALL: false,
      STATICCALL: false,
      DELEGATECALL: false,
      DEPLOY: false,
      TRANSFERVALUE: false,
      SIGN: false,
    };

    const permissionsToTest = Object.keys(LSP6_DEFAULT_PERMISSIONS);
    if (permissionHex === LSP6_ALL_PERMISSIONS) {
      permissionsToTest.forEach((testPermission) => {
        result[testPermission] = true;
      });
      return result;
    }

    const passedPermissionDecimal = hexToNumber(permissionHex);

    permissionsToTest.forEach((testPermission) => {
      const decimalTestPermission = hexToNumber(
        LSP6_DEFAULT_PERMISSIONS[testPermission],
      );
      const isPermissionIncluded =
        (passedPermissionDecimal & decimalTestPermission) ===
        decimalTestPermission;

      result[testPermission] = isPermissionIncluded;
    });

    return result;
  }

  /**
   * Decodes permissions from hexadecimal as defined by the LSP6 KeyManager Standard.
   *
   * @link https://github.com/lukso-network/LIPs/blob/main/LSPs/LSP-6-KeyManager.md LSP6 KeyManager Standard.
   * @param permissionHex The permission hexadecimal value to be decoded.
   * @returns Object specifying whether default LSP6 permissions are included in provided hexademical string.
   */
  decodePermissions(permissionHex: string) {
    return ERC725.decodePermissions(permissionHex);
  }

  /**
   * Hashes a key name for use on an ERC725Y contract according to LSP2 ERC725Y JSONSchema standard.
   *
   * @param {string} keyName The key name you want to encode.
   * @link https://github.com/lukso-network/LIPs/blob/main/LSPs/LSP-2-ERC725YJSONSchema.md ERC725YJsonSchema standard.
   * @returns {string} The keccak256 hash of the provided key name. This is the key that must be retrievable from the ERC725Y contract via ERC725Y.getData(bytes32 key).
   */
  static encodeKeyName(keyName: string): string {
    return encodeKeyName(keyName);
  }

  /**
   * Hashes a key name for use on an ERC725Y contract according to LSP2 ERC725Y JSONSchema standard.
   *
   * @param {string} keyName The key name you want to encode.
   * @link https://github.com/lukso-network/LIPs/blob/main/LSPs/LSP-2-ERC725YJSONSchema.md ERC725YJsonSchema standard.
   * @returns {string} The keccak256 hash of the provided key name. This is the key that must be retrievable from the ERC725Y contract via ERC725Y.getData(bytes32 key).
   */
  encodeKeyName(keyName: string): string {
    return encodeKeyName(keyName);
  }
}

export default ERC725;