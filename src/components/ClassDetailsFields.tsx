import {AcademicPeriodFields} from "./AcademicPeriodFields";

export function ClassDetailsFields({name,section,academicYear,semester}: {
  name:string;section:string|null;academicYear:string|null;semester:string|null;
}) {
  return <div className="class-details-fields">
    <div><label htmlFor="name">Class name <span aria-hidden="true">*</span></label><input id="name" name="name" type="text" required maxLength={200} defaultValue={name} autoComplete="off"/></div>
    <div><label htmlFor="section">Section</label><input id="section" name="section" type="text" maxLength={50} defaultValue={section??""} autoComplete="off"/></div>
    <AcademicPeriodFields academicYear={academicYear} semester={semester}/>
  </div>;
}
