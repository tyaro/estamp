import { writable } from 'svelte/store';

export type Setting = {
	schema_version: number,
	top_str:string,
	top_font_size:number,
	mid_font_size:number,
	btm_str:string,
	btm_font_size:number,
	output_size:number,
	date_mode: "auto" | "manual",
	date_format: "gregorian" | "wareki",
	manual_date: string | null,
	stamp_type: "dated_stamp",
}

export type LoadedSettings = {
	settings: Setting,
	revision: string | null,
	warning: string | null,
}


const defaultSetting:Setting = {
	schema_version:1,
	top_str:"所属",
	top_font_size:80,
	mid_font_size:60,
	btm_str:"名前",
	btm_font_size:80,
	output_size:100,
	date_mode:"auto",
	date_format:"gregorian",
	manual_date:null,
	stamp_type:"dated_stamp",
}

export const settings = writable(defaultSetting);
