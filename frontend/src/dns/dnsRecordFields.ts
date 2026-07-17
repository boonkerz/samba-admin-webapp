import type { DnsRecordType } from "@samba-admin/shared";

export interface RecordFieldState {
  address: string;
  target: string;
  preference: string;
  port: string;
  priority: string;
  weight: string;
  txtValue: string;
}

export const emptyRecordFieldState: RecordFieldState = {
  address: "",
  target: "",
  preference: "10",
  port: "",
  priority: "0",
  weight: "100",
  txtValue: "",
};

export function buildFieldsPayload(type: DnsRecordType, state: RecordFieldState): Record<string, string | number | string[]> {
  switch (type) {
    case "A":
    case "AAAA":
      return { address: state.address };
    case "CNAME":
    case "NS":
    case "PTR":
      return { target: state.target };
    case "MX":
      return { target: state.target, preference: Number(state.preference) };
    case "SRV":
      return { target: state.target, port: Number(state.port), priority: Number(state.priority), weight: Number(state.weight) };
    case "TXT":
      return { strings: state.txtValue.split("\n").map((s) => s.trim()).filter(Boolean) };
    default:
      return {};
  }
}

export function isRecordFieldStateValid(type: DnsRecordType, state: RecordFieldState): boolean {
  switch (type) {
    case "A":
    case "AAAA":
      return state.address.trim().length > 0;
    case "CNAME":
    case "NS":
    case "PTR":
      return state.target.trim().length > 0;
    case "MX":
      return state.target.trim().length > 0 && state.preference.trim().length > 0;
    case "SRV":
      return state.target.trim().length > 0 && state.port.trim().length > 0;
    case "TXT":
      return state.txtValue.trim().length > 0;
    default:
      return false;
  }
}

/** Reverses formatRecordData's <data> string back into editable fields, to prefill the edit dialog. */
export function parseFieldsFromData(type: DnsRecordType, data: string): RecordFieldState {
  switch (type) {
    case "A":
    case "AAAA":
      return { ...emptyRecordFieldState, address: data };
    case "CNAME":
    case "NS":
    case "PTR":
      return { ...emptyRecordFieldState, target: data };
    case "MX": {
      const i = data.lastIndexOf(" ");
      return { ...emptyRecordFieldState, target: data.slice(0, i), preference: data.slice(i + 1) };
    }
    case "SRV": {
      const parts = data.split(" ");
      const weight = parts.pop() ?? "100";
      const priority = parts.pop() ?? "0";
      const port = parts.pop() ?? "";
      return { ...emptyRecordFieldState, target: parts.join(" "), port, priority, weight };
    }
    case "TXT": {
      const strings = [...data.matchAll(/'([^']*)'/g)].map((m) => m[1]);
      return { ...emptyRecordFieldState, txtValue: strings.join("\n") };
    }
    default:
      return emptyRecordFieldState;
  }
}
