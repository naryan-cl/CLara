import { Inngest } from "inngest";

/** App id must match the Inngest dashboard app / sync target. */
export const inngest = new Inngest({ id: "clara" });

/** Smoke-test event — remove once real jobs exist. */
export const CLARA_HELLO = "clara/hello";
