import keytar from 'keytar';

export interface SecretStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<boolean>;
}

export class OsNativeSecretStore implements SecretStore {
  public constructor(private readonly serviceName: string) {}

  public async get(name: string): Promise<string | null> {
    return keytar.getPassword(this.serviceName, name);
  }

  public async set(name: string, value: string): Promise<void> {
    await keytar.setPassword(this.serviceName, name, value);
  }

  public async delete(name: string): Promise<boolean> {
    return keytar.deletePassword(this.serviceName, name);
  }
}
