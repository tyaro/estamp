import { writable } from 'svelte/store';

export type Setting = {
	top_str:String,
	top_font_size:number,
	mid_font_size:number,
	btm_str:String,
	btm_font_size:number,
	output_size:number,
}


const defaultSetting:Setting = {
	top_str:"所属",
	top_font_size:80,
	mid_font_size:60,
	btm_str:"名前",
	btm_font_size:80,
	output_size:100,
}

export const settings = writable(defaultSetting);
