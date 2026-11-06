import type {ResultSummary} from "@/lib/results";
import type {DashboardQuery} from "./ResultFilters";
import {SessionTable} from "./SessionTable";
import {SessionPages} from "./SessionPages";

const PAGE_SIZE=5;

export function PaginatedSessions({rows,query,instructor=false,basePath,sessionBasePath}:{rows:ResultSummary[];query:DashboardQuery;instructor?:boolean;basePath?:string;sessionBasePath?:string}) {
 const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
 const pages=Array.from({length:totalPages},(_,index)=><SessionTable key={index} rows={rows.slice(index*PAGE_SIZE,(index+1)*PAGE_SIZE)} instructor={instructor} sessionBasePath={sessionBasePath}/>);
 return <SessionPages pages={pages} totalRows={rows.length} pageSize={PAGE_SIZE} query={query} basePath={basePath??(instructor?"/class-results":"/results")}/>;
}
